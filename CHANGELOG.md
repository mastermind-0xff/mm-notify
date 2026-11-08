# Changelog

## Unreleased

From the aesweets.com integration review (2026-11-08):

- **Default durations:** alert closes after 8 s and error after 10 s, so nothing stays until
  closed by default. `timeoutMs: 0`, or `0` in `configure({ durations })`, still keeps one.
- **`configure({ repeats })`, default `false`:** the same kind and text as a message still on
  screen shows no second message; the one on screen starts over with the longer of the two
  times (`0` the longest, so a repeat never shortens it) and is read out again unless the
  repeat has `announce: false`, also when it was shown unannounced. `true` shows every call,
  as before. `showFlash` follows the same rule.
- **Clear all is pinned when the stack doesn't fit the window:** a full row at the far edge
  (bottom for the top positions, top for the bottom positions), over the messages. The stack
  no longer scrolls. Measured with a `ResizeObserver` and `resize`, so browsers without `dvh`
  (Chrome before 108, Firefox before 101) keep the button on screen too. New tokens
  `--notify-pin-bottom` and `--notify-pin-top` (default `0`) move that edge, for a fixed footer
  or header. **Removed:** `--notify-max-height`, which nothing reads any more. The region now
  spans from where the stack starts to the far edge (it lets the pointer through), so
  `--notify-flow` also decides the edge: `column` hangs from `--notify-top`, `column-reverse`
  stands on `--notify-bottom` (read only there). The other two pairs worked before and don't
  now. The bottom positions keep their 1.5rem below the newest message, now the list's padding.
- **Fixed:** under a site's global `box-sizing: border-box` a new message grew to its height
  without the padding, its text cut off, then snapped to its full size and moved the stack.
  A message is `box-sizing: content-box` now, whatever the site sets.
- `npm run size`: 3049 B, guard raised from 2800 to 3100 B.

## 0.0.0 (unreleased)

Nothing released yet. The plan is in `.claude/plan.md` (local).

Extracted from the aesweets.com rebuild (`client/toast.ts`, `components/toast.css`):

- `toast`, `flash`, `showFlash`, `configure` in `@mmutils/notify`; `hasFlash` alone
  in `@mmutils/notify/has-flash`, so a page can ask without loading the rest.
- The CSS arrives with the module, as a constructable stylesheet with a `<style>`
  fallback, built from `src/notify.css` (also shipped as
  `@mmutils/notify/notify.css`). `--notify-*` custom properties for colors, glow and
  position; `mm-notify` class names.
- `npm run size`: 2755 B minified and gzipped with the CSS, 123 B for the eager
  check, which loads no other chunk.
- `examples/`: a page to try the kinds, positions and options under a strict CSP
  (`npm run examples`), and a design tool that exports CSS, settings or a brief for an
  agent (`examples/design.html`).

Changed against the original:

- Alert and error stay until closed by default (they closed after 8 s and 10 s).
- The same text again shows a second message. It replaced the first.
- `configure({ sequential: true })`: one timer at a time, oldest message first, and a
  message that stays until closed holds those behind it.
- A clear-all button from three messages, which fades in and out (`clearAllFrom`,
  `clearAllLabel`, `--notify-clear`, `--notify-clear-color`).
- A new message comes in at the start of the stack, on top at the top and at the bottom
  at the bottom (`--notify-flow`), and grows into place, so the whole stack moves
  smoothly. It was always added at the end, and the stack jumped.
- Messages that don't fit the window scroll, so the newest and the button stay on screen.
  They ran off it. The live region is now `.mm-notify-list`, inside the popover.
- A closing message shrinks from its real height to 0 in 0.3 s, its contents gone in the
  first 0.1 s, and is removed at 0.35 s, always. It went at the first `transitionend`, the
  opacity's at 0.2 s, cutting the collapse short.
- In the bottom positions a lower message paints over the glow of the one above it, as in
  the top positions. In Firefox and WebKit that glow tinted its top edge.

Fixed against the original, each with a test that failed first, except the last
(CSS layout, reproduced in Chrome by turning the rule off):

- Browsers without popover threw a SyntaxError. A plain fixed element works now.
- A stale timer could close a message while hovered, and moving the pointer away
  while it had focus (or the other way round) closed it. It counts down now only when
  nothing holds it.
- A malformed flash stayed in storage, so every page loaded the module for nothing.
- A removal landing just before a new message's frame closed the popover, so the new
  message went into a hidden region.
- A long e-mail pushed the close cross out of a narrow box (seen in Chrome).
