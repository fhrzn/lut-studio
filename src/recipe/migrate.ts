import { RecipeSchema } from './schema';
import type { Recipe } from './types';

export const CURRENT_SCHEMA_VERSION = 1;

type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

/**
 * Registry keyed by the schemaVersion a migration upgrades FROM; each entry
 * returns data at version + 1. Empty while v1 is the only version. To add v2:
 * bump CURRENT_SCHEMA_VERSION, update the schema, and register `1: (d) => ...`.
 */
const MIGRATIONS: Readonly<Record<number, Migration>> = {};

export class RecipeMigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecipeMigrationError';
  }
}

/** Upgrades raw recipe data of any known schemaVersion to the current one and validates it. */
export function migrateRecipe(input: unknown): Recipe {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new RecipeMigrationError('Recipe must be an object');
  }
  let data = input as Record<string, unknown>;
  let version = data.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new RecipeMigrationError('Recipe is missing a valid schemaVersion');
  }
  if (version > CURRENT_SCHEMA_VERSION) {
    throw new RecipeMigrationError(
      `Recipe schemaVersion ${version} is newer than supported version ${CURRENT_SCHEMA_VERSION}`,
    );
  }
  while (version < CURRENT_SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) throw new RecipeMigrationError(`No migration from schemaVersion ${version}`);
    data = step(data);
    version += 1;
    data.schemaVersion = version;
  }
  return RecipeSchema.parse(data);
}
