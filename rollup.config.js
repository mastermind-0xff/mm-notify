import typescript from '@rollup/plugin-typescript';
import { cssText } from './scripts/css-text.js';

const typescriptPlugin = () =>
  typescript({
    tsconfig: './tsconfig.build.json',
    declaration: false,
    declarationMap: false,
    emitDeclarationOnly: false,
    outDir: undefined,
  });

// no dependencies. Three entries, also in package.json "exports": the package, the
// small check a page can load eagerly (no toast code, no CSS), and the CSS string
const input = ['src/index.ts', 'src/has-flash.ts', 'src/css.ts'];

export default [
  {
    input,
    plugins: [cssText(), typescriptPlugin()],
    output: {
      dir: 'dist/esm',
      format: 'esm',
      entryFileNames: '[name].js',
      // one file per module, so the eager entry stays free of the lazy code
      preserveModules: true,
      preserveModulesRoot: 'src',
      sourcemap: true,
    },
  },
  {
    input,
    plugins: [cssText(), typescriptPlugin()],
    output: {
      // `.cjs`: the package is `"type": "module"`, so `.js` files would be
      // loaded as ESM by `require`
      dir: 'dist/cjs',
      format: 'cjs',
      entryFileNames: '[name].cjs',
      preserveModules: true,
      preserveModulesRoot: 'src',
      exports: 'named',
      sourcemap: true,
    },
  },
];
