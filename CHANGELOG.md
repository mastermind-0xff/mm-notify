# Changelog

## 0.1.0

First release. Small on-page notifications that cost nothing until the first
message: the code and its CSS load together, on first use. It started as the
notifications of aesweets.com.

### Messages

- `toast(text, kind, options)` shows a message of one of four kinds: `success`,
  `error`, `alert`, `neutral`. Plain text only (`textContent`, DOM APIs, no
  `innerHTML`), so it passes Trusted Types. Default times: 5 s for success and
  neutral, 8 s for alert, 10 s for error; `timeoutMs: 0` or `Infinity` keeps a
  message until it is closed, as does any time too long for a browser's timer (from
  2^31 ms, about 24.8 days). The time runs only while neither the pointer nor the
  focus is on the message. Messages whose times end within 16 ms (a frame) of each
  other close together, so one may close up to 16 ms early.
- `toast` returns a `ToastHandle` to change the message while it is up: `update`
  (new words, a new kind), `replace` (new contents altogether), `progress` (a bar
  from 0 to 1, or unknown), `log` (console-like lines under the text), `close`, and
  `closed` and `whenClosed`. Work in the background is one message from start to
  outcome. A closed message never comes back.
- The same kind and text as a message on screen shows no second message: the one up
  starts over, and is read out again. `configure({ repeats: true })` shows every
  call. A message with a progress bar is never such a match.
- `configure({ sequential: true })` runs one timer at a time, oldest message first.
- From three messages a **Clear all** button appears (`clearAllFrom`,
  `clearAllLabel`). A tall stack scrolls inside `--notify-max-height`, with faded
  edges where more is beyond them.
- `flash(text, kind, key)` leaves a message for the next page in `sessionStorage`;
  `showFlash(key)` shows it once. The stored value is treated as untrusted: only its
  text is shown, as text, and only the four kinds are taken (anything else is
  neutral). Failing storage loses the message without throwing.
- `configure` changes the defaults: `closeLabel`, `clearAllLabel`,
  `clearAllFrom`, `durations`, `repeats`, `sequential`, `logLines`, `injectCss`.
  The settings have no prototype, so options parsed from JSON can't give them one
  with a `"__proto__"` key.

### Loading

- No side effects on import and no DOM access until the first call; it imports
  cleanly on the server.
- `@mmutils/notify/has-flash` exports `hasFlash(key)` alone, in a file that imports
  nothing: the one thing a page loads eagerly, to find out whether a flash is waiting.
- The CSS arrives with the module, as a constructable stylesheet (a strict
  `style-src` doesn't block it) with a `<style>` fallback for browsers without one,
  which needs `'unsafe-inline'` under a CSP. `@mmutils/notify/notify.css`
  is the plain file, `@mmutils/notify/css` exports it as a minified string, and
  `configure({ injectCss: false })` leaves the loading to the page.
- About 4.8 KB minified and gzipped with its CSS, 123 B for the eager check.

### Work on the page

- The messages of one frame come into the page together, and Clear all, or the
  messages whose times end together, close together: everything is read before
  anything changes, so the browser lays the page out once for all of them (twice to
  close), not once or twice per message. In Chrome, on a page of 1500 paragraphs, 200
  messages in one frame take about 20 to 40 ms of work, and Clear all of them about
  20 ms.
- A changing message (`update`, `replace`, `progress`, `log`) sets the height it grows
  to and its log's scroll to the newest line at the next frame, once for all the changes
  until then: 100 changes in a row take under 1 ms. Whether the reader scrolled the log
  up is read at that frame too, so lines faster than frames never pull a reader back.
- A message closed before its time (its cross, `close()`, Clear all, its region taken
  out of the page) stops its timer at once: nothing keeps it after it has gone.

### Look and accessibility

- Colors, glow, position, width, the stack's height, radius, font size, a log's
  height and the clear-all button are `--notify-*` custom properties, each read
  with its default, so one set on `:root` wins in any cascade order. Top center is
  the default; corners, a position under a fixed header and a bottom stack are
  CSS-only changes (`--notify-flow`). Class names keep the `mm-notify` prefix.
- A manual popover, so messages sit in the top layer, above menus opened before them
  and raised again above those opened later. A browser without popover gets a plain
  fixed element and nothing throws.
- A polite live region created once; errors are `role="alert"`; `announce: false`
  keeps a message out of the live region (it still has its named close button). The
  progress bar is a `role="progressbar"`, the log a `role="log"`. Default colors keep
  4.5:1 with their dark text. Reduced motion and forced colors are respected. A
  closing message gives the focus back to where it came from.
- The repository's design tool exports a look as CSS, as settings or as a brief for an
  agent.

### Package

- ESM and CommonJS, one file per module, no runtime dependencies, Node.js 22 or newer.
  Type declarations for both: `.d.ts` for `import`, `.d.cts` for `require` (TypeScript's
  `node16` and `nodenext` read a `.d.ts` in this package as ESM), and `typesVersions` for
  `has-flash` and `css` under the older `node10` resolution.
