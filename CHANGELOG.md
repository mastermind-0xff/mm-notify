# Changelog

## 0.0.0 (unreleased)

Nothing released yet. The plan is in `.claude/plan.md` (local).

Extracted from the aesweets.com rebuild (`client/toast.ts`, `components/toast.css`):

- `toast`, `flash`, `showFlash`, `configure` in `@mmutils/notify`; `hasFlash` alone
  in `@mmutils/notify/has-flash`, so a page can ask without loading the rest.
- The CSS arrives with the module, as a constructable stylesheet with a `<style>`
  fallback, built from `src/notify.css` (also shipped as
  `@mmutils/notify/notify.css`). `--notify-*` custom properties for colors, glow and
  position; `mm-notify` class names.
- `npm run size`: 2570 B minified and gzipped with the CSS, 123 B for the eager
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
