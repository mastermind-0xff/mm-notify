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
- `npm run size`: 2392 B minified and gzipped with the CSS, 123 B for the eager
  check, which loads no other chunk.
- `examples/`: a page with every kind, position and option under a strict CSP
  (`npm run examples`).

Fixed against the original, each with a test that failed first:

- Browsers without popover threw a SyntaxError. A plain fixed element works now.
- A stale timer could close a message while hovered, and moving the pointer away
  while it had focus (or the other way round) closed it. It counts down now only when
  nothing holds it.
- A malformed flash stayed in storage, so every page loaded the module for nothing.
- The same text twice in one frame showed twice.
- A removal landing just before a new message's frame closed the popover, so the new
  message went into a hidden region.
- A long e-mail pushed the close cross out of a narrow box (seen in Chrome).
