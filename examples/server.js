/**
 * The example page (`npm run examples`): serves the page, the built package
 * (dist) and its sources (for the source maps), and a pretend backend for the
 * background-work examples (jobs.js). With a strict CSP, so the page
 * also shows that the package needs no inline styles and passes Trusted Types.
 * Development only: listens on 127.0.0.1.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { api } from './jobs.js';

const root = resolve(import.meta.dirname, '..');
const port = Number(process.env.PORT ?? 5179);
const served = ['examples', 'dist', 'src'].map((dir) => join(root, dir) + sep);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.ts': 'text/plain; charset=utf-8',
};
const csp = [
  "default-src 'self'",
  "style-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "require-trusted-types-for 'script'",
].join('; ');

function reply(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'content-type': type,
    'content-security-policy': csp,
    'cache-control': 'no-store',
  });
  res.end(body);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/') {
    res.writeHead(302, { location: '/examples/' });
    return res.end();
  }
  // The pretend backend the background-work examples talk to.
  if (api(req, res, url)) return;
  let path;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    return reply(res, 400, 'Bad request');
  }
  const file = join(root, path.endsWith('/') ? `${path}index.html` : path);
  if (!served.some((dir) => file.startsWith(dir)))
    return reply(res, 404, 'Not found');
  try {
    reply(
      res,
      200,
      await readFile(file),
      types[extname(file)] ?? 'application/octet-stream'
    );
  } catch {
    reply(res, 404, 'Not found');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Examples: http://localhost:${port}/examples/`);
});
