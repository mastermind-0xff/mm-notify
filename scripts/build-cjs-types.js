/**
 * The last build step: a CommonJS twin of every declaration file, `x.d.cts` next to
 * `x.d.ts`, its relative imports ending in `.cjs`. The package is `"type": "module"`,
 * so TypeScript reads a `.d.ts` as ESM, while `require` loads `dist/cjs`; without the
 * twins a CommonJS file on `node16` or `nodenext` can't import the package (TS1479),
 * and its types would describe another module than the one it runs.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../dist/types/', import.meta.url));
const RELATIVE = /((?:from|import\()\s*['"])(\.{1,2}\/[^'"]*)\.js(['"])/gu;
const LEFT = /(?:from|import\()\s*['"]\.{1,2}\/[^'"]*(?<!\.cjs)['"]/u;

const entries = readdirSync(root, { recursive: true, withFileTypes: true });
let written = 0;
for (const entry of entries) {
  if (!entry.isFile() || !entry.name.endsWith('.d.ts')) continue;
  const file = join(entry.parentPath, entry.name);
  const twin = readFileSync(file, 'utf8').replace(RELATIVE, '$1$2.cjs$3');
  // A relative import in another shape would still point at an ESM file.
  const left = LEFT.exec(twin);
  if (left !== null) throw new Error(`${file}: not rewritten: ${left[0]}`);
  writeFileSync(file.replace(/\.d\.ts$/u, '.d.cts'), twin);
  written++;
}
if (written === 0) throw new Error(`No declaration files in ${root}`);
