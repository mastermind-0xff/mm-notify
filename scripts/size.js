/**
 * `npm run size` (after the build): what a page pays, measured the way a site
 * bundles the package (esbuild, minified, for the browsers aesweets supports),
 * then gzipped. Fails above the budgets, or when one of the promises the
 * package makes about loading doesn't hold:
 *
 * - importing and not using it costs nothing (the JS has no side effects);
 * - the eager entry carries no toast code and no CSS, and loads no other chunk
 *   (a shared chunk would be one more request on every page);
 * - the built files import cleanly on the server, in both module formats.
 */
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { build } from 'esbuild';
import { minifiedCss } from './css-text.js';

const root = resolve(import.meta.dirname, '..');
// The package loads on first use, so its size is a guard rather than a hard limit
// (the author's call). The eager check runs on every page: that budget is the real one.
const BUDGETS = { package: 2700, eager: 200 };
const problems = [];

const bundle = (contents, options = {}) =>
  build({
    stdin: { contents, resolveDir: root, loader: 'js' },
    bundle: true,
    minify: true,
    format: 'esm',
    platform: 'browser',
    target: ['es2022', 'chrome100', 'firefox100', 'safari15.4'],
    legalComments: 'none',
    write: false,
    logLevel: 'silent',
    outdir: 'out',
    ...options,
  });

const measure = (text) => ({
  raw: Buffer.byteLength(text),
  gzip: gzipSync(text, { level: 9 }).length,
  brotli: brotliCompressSync(text).length,
});

async function size(name, contents) {
  const { outputFiles } = await bundle(contents);
  return { name, ...measure(outputFiles[0].text) };
}

const rows = [
  await size('the package, with its CSS', "export * from '@mmutils/notify';"),
  await size('toast alone', "export { toast } from '@mmutils/notify';"),
  await size(
    'eager: hasFlash',
    "export { hasFlash } from '@mmutils/notify/has-flash';"
  ),
  { name: '(the CSS alone, in the package)', ...measure(minifiedCss()) },
  await size(
    'imported, not used',
    "import '@mmutils/notify'; import '@mmutils/notify/has-flash';"
  ),
];

console.log('bytes     minified      gzip    brotli');
for (const { name, raw, gzip, brotli } of rows)
  console.log(
    `${String(raw).padStart(14)}${String(gzip).padStart(10)}${String(brotli).padStart(10)}  ${name}`
  );

const [whole, , eager, , unused] = rows;
if (whole.gzip > BUDGETS.package)
  problems.push(`package: ${whole.gzip} B gzip, budget ${BUDGETS.package} B`);
if (eager.gzip > BUDGETS.eager)
  problems.push(`eager entry: ${eager.gzip} B gzip, budget ${BUDGETS.eager} B`);
if (unused.raw > 0)
  problems.push(`imported, not used, still costs ${unused.raw} B`);

// The recommended pattern, split like a site's build would split it: the check in
// the eager code, a message on first use, a lazy feature that leaves a flash.
const split = await bundle(
  `import { hasFlash } from '@mmutils/notify/has-flash';
   if (hasFlash()) import('@mmutils/notify').then((m) => m.showFlash());
   import('feature');`,
  {
    splitting: true,
    metafile: true,
    plugins: [
      {
        name: 'feature',
        setup(build) {
          build.onResolve({ filter: /^feature$/ }, ({ path }) => ({
            path,
            namespace: 'feature',
          }));
          build.onLoad({ filter: /./, namespace: 'feature' }, () => ({
            contents: "import { flash } from '@mmutils/notify'; flash('Bye');",
            resolveDir: root,
          }));
        },
      },
    ],
  }
);
const entryMeta = Object.values(split.metafile.outputs).find((output) =>
  output.entryPoint?.includes('stdin')
);
// The eager code must load nothing else: every chunk here is one more request.
const eagerImports = entryMeta.imports.filter(
  ({ kind }) => kind === 'import-statement'
);
if (eagerImports.length > 0)
  problems.push(
    `the eager entry loads ${eagerImports.length} chunk(s) with it`
  );
const entry = split.outputFiles.find((file) => file.path.includes('stdin'));
if (entry.text.includes('mm-notify-region'))
  problems.push('the eager entry carries the CSS or the toast code');
if (!split.outputFiles.some((file) => file.text.includes('mm-notify-region')))
  problems.push('no chunk carries the CSS');
console.log(
  `\nsplit like a site: ${measure(entry.text).gzip} B gzip eager, loading ${eagerImports.length} other chunks; ${split.outputFiles.length - 1} lazy chunks`
);

// On the server: nothing here may touch a document.
if (typeof document !== 'undefined') throw new Error('expected plain Node');
try {
  await import('../dist/esm/index.js');
  await import('../dist/esm/has-flash.js');
  const require = createRequire(import.meta.url);
  require('../dist/cjs/index.cjs');
  require('../dist/cjs/has-flash.cjs');
  console.log('import on the server (esm, cjs): fine');
} catch (error) {
  problems.push(`import on the server: ${String(error)}`);
}

if (problems.length > 0) {
  console.error(`\n${problems.join('\n')}`);
  process.exit(1);
}
console.log(`budgets held (${BUDGETS.package} B, ${BUDGETS.eager} B gzip)`);
