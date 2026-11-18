import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dir = resolve(__dirname, '../../../src/lut/__fixtures__');

export function fixture(name: string): string {
  return readFileSync(resolve(dir, name), 'utf8');
}
