import { describe, expect, it } from 'vitest';
import { createLayer, createRecipe } from '@/recipe/factory';
import { CURRENT_SCHEMA_VERSION, migrateRecipe, RecipeMigrationError } from '@/recipe/migrate';

describe('migrateRecipe', () => {
  it('passes a valid v1 recipe through unchanged', () => {
    const r = { ...createRecipe('x'), layers: [createLayer('exposure')] };
    expect(migrateRecipe(JSON.parse(JSON.stringify(r)))).toEqual(r);
    expect(CURRENT_SCHEMA_VERSION).toBe(1);
  });

  it.each([
    null,
    'x',
    [],
    {},
    { schemaVersion: '1' },
    { schemaVersion: 0 },
    { schemaVersion: 1.5 },
  ])('rejects missing or invalid schemaVersion: %j', (input) => {
    expect(() => migrateRecipe(input)).toThrow(RecipeMigrationError);
  });

  it('rejects a newer schemaVersion', () => {
    expect(() => migrateRecipe({ ...createRecipe('x'), schemaVersion: 2 })).toThrow(/newer/);
  });

  it('validates v1 content', () => {
    expect(() => migrateRecipe({ ...createRecipe('x'), name: '' })).toThrow();
  });
});
