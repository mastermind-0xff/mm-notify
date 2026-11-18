# Changelog

## Unreleased

First release. Small on-page notifications that cost nothing until the first
message: the code and its CSS load together, on first use. It started as the
notifications of aesweets.com.

### Messages

- `toast(text, kind, options)` shows a message of one of four kinds: `success`,
  `error`, `alert`, `neutral`. Plain text only (`textContent`, DOM APIs, no
  `innerHTML`), so it passes Trusted Types. Default times: 5 s for success and
  neutral, 8 s for alert, 10 s for error; `timeoutMs: 0` keeps a message until it is
  closed. The time runs only while neither the pointer nor the focus is on the
  message.
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
  `showFlash(key)` shows it once. The stored value is treated as untrusted, and
  failing storage loses the message without throwing.
- `configure` changes the defaults once: `closeLabel`, `clearAllLabel`,
  `clearAllFrom`, `durations`, `repeats`, `sequential`, `logLines`, `injectCss`.

### Loading

- No side effects on import and no DOM access until the first call; it imports
  cleanly on the server.
- `@mmutils/notify/has-flash` exports `hasFlash(key)` alone, in a file that imports
  nothing: the one thing a page loads eagerly, to find out whether a flash is waiting.
- The CSS arrives with the module, as a constructable stylesheet (a strict
  `style-src` doesn't block it) with a `<style>` fallback. `@mmutils/notify/notify.css`
  is the plain file, `@mmutils/notify/css` exports it as a minified string, and
  `configure({ injectCss: false })` leaves the loading to the page.
- About 4.5 KB minified and gzipped with its CSS, 123 B for the eager check. ESM and
  CommonJS builds with type declarations; no runtime dependencies.

### Look and accessibility

- Colors, glow, position, width, height, radius, font size, the log and the
  clear-all button are `--notify-*` custom properties, each read with its default,
  so one set on `:root` wins in any cascade order. Top center is the default;
  corners, a position under a fixed header and a bottom stack are CSS-only changes
  (`--notify-flow`). Class names keep the `mm-notify` prefix.
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
