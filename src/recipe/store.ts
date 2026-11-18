import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { migrateRecipe } from './migrate';
import { RecipeSchema } from './schema';
import type { Recipe } from './types';

export interface LutRecord {
  id: string;
  name: string;
  cubeText: string;
  size: number;
  createdAt: string;
}

interface LutStudioDB extends DBSchema {
  recipes: { key: string; value: Recipe };
  luts: { key: string; value: LutRecord };
}

export const DB_NAME = 'lut-studio';
export const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<LutStudioDB>> | null = null;

function getDb(): Promise<IDBPDatabase<LutStudioDB>> {
  dbPromise ??= openDB<LutStudioDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore('recipes', { keyPath: 'id' });
      db.createObjectStore('luts', { keyPath: 'id' });
    },
  });
  return dbPromise;
}

/** Closes the cached connection; the next call reopens it. Used by tests to simulate a reload. */
export async function closeDb(): Promise<void> {
  if (!dbPromise) return;
  const db = await dbPromise;
  dbPromise = null;
  db.close();
}

export async function listRecipes(): Promise<Recipe[]> {
  const all = await (await getDb()).getAll('recipes');
  return all.map(migrateRecipe).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getRecipe(id: string): Promise<Recipe | undefined> {
  const raw = await (await getDb()).get('recipes', id);
  return raw === undefined ? undefined : migrateRecipe(raw);
}

/** Validates and stores the recipe with a fresh `updatedAt`; returns what was stored. */
export async function saveRecipe(recipe: Recipe): Promise<Recipe> {
  const saved = RecipeSchema.parse({ ...recipe, updatedAt: new Date().toISOString() });
  await (await getDb()).put('recipes', saved);
  return saved;
}

export async function deleteRecipe(id: string): Promise<void> {
  await (await getDb()).delete('recipes', id);
}

/** Stores a copy with a new id, fresh layer ids and timestamps. Returns undefined if `id` is unknown. */
export async function duplicateRecipe(id: string): Promise<Recipe | undefined> {
  const original = await getRecipe(id);
  if (!original) return undefined;
  const now = new Date().toISOString();
  const copy: Recipe = {
    ...structuredClone(original),
    id: crypto.randomUUID(),
    name: `${original.name} copy`,
    source: 'user',
    createdAt: now,
    updatedAt: now,
  };
  copy.layers = copy.layers.map((layer) => ({ ...layer, id: crypto.randomUUID() }));
  await (await getDb()).put('recipes', RecipeSchema.parse(copy));
  return copy;
}

const SIZE_RE = /^[ \t]*LUT_(?:3D|1D)_SIZE[ \t]+(\d+)/m;

/** Stores raw `.cube` text and returns the new LUT id. Only the size header is read here; full parsing lives in `@/lut`. */
export async function putLut(name: string, cubeText: string): Promise<string> {
  const size = Number(SIZE_RE.exec(cubeText)?.[1]);
  if (!Number.isInteger(size) || size < 2) {
    throw new Error('Not a .cube LUT: missing LUT_3D_SIZE / LUT_1D_SIZE');
  }
  const id = crypto.randomUUID();
  await (
    await getDb()
  ).put('luts', { id, name, cubeText, size, createdAt: new Date().toISOString() });
  return id;
}

export async function getLut(id: string): Promise<LutRecord | undefined> {
  return (await getDb()).get('luts', id);
}

export async function listLuts(): Promise<LutRecord[]> {
  return (await getDb()).getAll('luts');
}

export type DeleteLutResult = { deleted: true } | { deleted: false; referencedBy: string[] };

/** Deletes the LUT unless a recipe layer uses it, in which case returns those recipes' names. Check and delete share one transaction. */
export async function deleteLut(id: string): Promise<DeleteLutResult> {
  const db = await getDb();
  const tx = db.transaction(['recipes', 'luts'], 'readwrite');
  const recipes = await tx.objectStore('recipes').getAll();
  const referencedBy = recipes
    .filter((r) => r.layers.some((l) => l.type === 'lut' && l.params.lutId === id))
    .map((r) => r.name);
  if (referencedBy.length > 0) {
    await tx.done;
    return { deleted: false, referencedBy };
  }
  await tx.objectStore('luts').delete(id);
  await tx.done;
  return { deleted: true };
}
