/**
 * `import css from './notify.css'` gives the minified CSS as a string, in the
 * build (rollup) and in the tests (vitest). The package ships the string, so
 * consumers need no plugin.
 *
 * The module id gets a `.js` ending: Vite treats ids ending in `.css` as
 * stylesheets, and with `preserveModules` the id names the output file
 * (`dist/esm/notify.css.js`).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { transformSync } from 'esbuild';

/** The browsers aesweets supports (its `build/js.ts`), the first consumer. */
const target = ['chrome100', 'firefox100', 'safari15.4'];

export function minifyCss(source) {
  return transformSync(source, {
    loader: 'css',
    minify: true,
    target,
  }).code.trim();
}

export function cssText() {
  return {
    name: 'css-text',
    enforce: 'pre',
    resolveId(source, importer) {
      if (importer === undefined || !source.endsWith('.css')) return null;
      return `${resolve(dirname(importer), source)}.js`;
    },
    load(id) {
      if (!id.endsWith('.css.js')) return null;
      const css = minifyCss(readFileSync(id.slice(0, -3), 'utf8'));
      return { code: `export default ${JSON.stringify(css)};`, map: null };
    },
  };
}
