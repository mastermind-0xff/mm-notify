/**
 * A pretend backend for the example page: work that runs on the server while the
 * page tracks it with a notification (`toast()`'s handle). The package itself has
 * no network code; this is what a site's own API would be. Development only.
 *
 * - `POST /api/jobs?ms=8000`: starts a job of 12 files, answers `{ id }`.
 * - `GET /api/jobs/<id>`: `{ progress, done, total, finished }`, for polling.
 * - `GET /api/jobs/<id>/log`: the job's lines as server-sent events, then `done`.
 * - `GET /api/slow?ms=3000`: answers `{ ok: true }` after that long.
 */
const TOTAL = 12;
const jobs = new Map();
let next = 0;

const STEPS = [
  'Resolving packages',
  'Compiling src/index.ts',
  'Compiling src/toast.ts',
  'Bundling the CSS',
  'Minifying 3 chunks',
  'Writing dist/esm',
  'Writing dist/cjs',
  'Checking the size: 4.3 KB gzip',
  'Uploading 14 files',
  'Warming the cache on 3 edges',
  'Swapping the release',
  'Purging old assets',
];

const json = (res, body, status = 200) => {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(body));
};

const wanted = (url, fallback) =>
  Math.min(60_000, Math.max(0, Number(url.searchParams.get('ms')) || fallback));

function state(job) {
  const progress = Math.min(1, (Date.now() - job.started) / job.ms);
  return {
    progress,
    done: Math.floor(progress * TOTAL),
    total: TOTAL,
    finished: progress >= 1,
  };
}

/** Streams the job's lines as they happen, one per step, then `done`. */
function stream(req, res, job) {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store',
  });
  let sent = 0;
  const tick = () => {
    const { done, finished } = state(job);
    while (sent < done || (finished && sent < TOTAL)) {
      const time = new Date().toISOString().slice(11, 19);
      res.write(`data: ${time}  ${STEPS[sent]}\n\n`);
      sent += 1;
    }
    if (finished) {
      res.write('event: done\ndata: ok\n\n');
      clearInterval(timer);
      res.end();
    }
  };
  const timer = setInterval(tick, 100);
  tick();
  req.on('close', () => {
    clearInterval(timer);
  });
}

/** Answers a request under `/api/`; false for any other path. */
export function api(req, res, url) {
  if (!url.pathname.startsWith('/api/')) return false;
  if (url.pathname === '/api/slow') {
    setTimeout(
      () => {
        json(res, { ok: true });
      },
      wanted(url, 3000)
    );
    return true;
  }
  if (url.pathname === '/api/jobs' && req.method === 'POST') {
    next += 1;
    const id = String(next);
    jobs.set(id, { started: Date.now(), ms: wanted(url, 8000) || 1 });
    // A pretend server keeps no job for long.
    setTimeout(() => jobs.delete(id), 300_000).unref();
    json(res, { id }, 201);
    return true;
  }
  const [, , , id, what] = url.pathname.split('/');
  const job = jobs.get(id);
  if (!job) json(res, { error: 'No such job' }, 404);
  else if (what === 'log') stream(req, res, job);
  else json(res, state(job));
  return true;
}
