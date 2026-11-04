/**
 * `import css from './notify.css'` gives the minified CSS as a string, in the
 * build (rollup) and in the tests (vitest). The package ships the string, so
 * consumers need no plugin.
 *
 * A virtual module: Vite treats real ids ending in `.css` as stylesheets. With
 * `preserveModules` its output file is `dist/esm/_virtual/_notify-css.js`.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { transformSync } from 'esbuild';

const file = resolve(import.meta.dirname, '../src/notify.css');
const id = '\0notify-css';

/** The browsers aesweets supports (its `build/js.ts`), the first consumer. */
const target = ['chrome100', 'firefox100', 'safari15.4'];

/** esbuild leaves the fallbacks in `var()` as written; these have no strings in them. */
const tightFallbacks = (css) =>
  css.replaceAll(', ', ',').replaceAll(' / ', '/').replaceAll(') )', '))');

export function minifiedCss() {
  return tightFallbacks(
    transformSync(readFileSync(file, 'utf8'), {
      loader: 'css',
      minify: true,
      target,
    }).code.trim()
  );
}

export function cssText() {
  return {
    name: 'css-text',
    enforce: 'pre',
    resolveId(source) {
      return source === './notify.css' ? id : null;
    },
    load(loading) {
      if (loading !== id) return null;
      return {
        code: `export default ${JSON.stringify(minifiedCss())};`,
        map: null,
      };
    },
  };
}
