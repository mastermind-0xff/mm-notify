# Changelog

## Unreleased

From the user's answer to aesweets.com D49 (2026-11-14: "It should be possible to update
the notification"):

- **`toast()` returns a handle** (`ToastHandle`); code that ignores it works as before.
  `update(text, kind?, options?)` changes the words (and the kind), keeping a bar and a
  log; `replace(text, kind?, options?)` changes everything, as `toast()` would show it, in
  place; `progress(value, text?)` shows a progress bar (0 to 1, `true` for an unknown
  amount, `false` to remove it); `log(line)` adds a console-like line (the newest in sight,
  scrolling inside the message, `configure({ logLines })` kept, 100 by default, at least
  1: review, 0 emptied the log and a negative number hung the page);
  `close()`; `closed`; `whenClosed`, a promise. An empty text returns a closed handle.
- **The time:** while a bar shows the message doesn't time out; every other change starts
  its time over. `update` keeps the time unless the kind changes (that kind's default) or
  `timeoutMs` is given; `replace` takes the kind's default.
- **Closed is closed:** after the reader (or the time, or Clear all) closed a message,
  every method does nothing; it never comes back.
- **Screen readers:** an update of the words alone is silent unless `announce: true`; a new
  kind and `replace` are read out unless `announce: false`. Before its first frame a
  message keeps the announcement it came with (review: a first update there silenced an
  announced message). The bar is a named
  `role="progressbar"` (`aria-valuenow`, none while the amount is unknown,
  `aria-valuetext` when given), never announced; the log is a `role="log"` with
  `aria-live="off"`, focusable to scroll. Reduced motion: no gliding fill, a bar with no
  amount stands still.
- **The focus after closing** (the user's N27, 2026-11-15): a message that closes with the
  focus in it (its cross, or `close()` from code while the reader is on its cross or in
  its log) gives the focus back to where it came from (the `focusin`'s `relatedTarget`),
  if that is still on the page and focusable, without scrolling; otherwise it falls to the
  page as before. Before, the focus fell to `body` when the message was removed, for the
  cross too. `replace` keeps the focus in the message.
- **Repeats:** a repeat that shows no message returns the handle of the one on screen and
  compares with what it says now; an update never merges two messages. A message with a
  progress bar is never a repeat target (the user's N23, 2026-11-15): the same text shows a
  message of its own, so two pieces of work never share one outcome; equal messages
  without a bar still show once.
- **New token** `--notify-log-height` (`8.4em`, six lines). A message is `flex-wrap: wrap`
  now (the bar and the log take a row each); nothing else changes for a message without
  them.
- **Forced colors:** the progress bar and the close cross take the text's system color
  (review: both are backgrounds, which forced colors give the page's color, so both
  vanished; the cross did before this release too). The message box has a transparent
  1px outline, which forced colors draw as its edge (the user's N26, 2026-11-15: its color
  and glow are gone there, so its words stood on the page's content); nothing shows
  without forced colors. A log's panel is a lighter veil
  (white at 20 %), which keeps 4.5:1 on every default color (review: the darker one took
  the error red to 4.25:1).
- `npm run size`: 4346 B (was 3438 B; 4302 B before the review's fixes). The guard is
  4600 B (was 3500 B): the user lifted the limit, since the package loads on first use
  (2026-11-15); the guard only catches accidental growth. One entry, no separate
  `@mmutils/notify/progress`.

From the user's answers to the aesweets.com questions (2026-11-09, D43, D47):

- **The stack scrolls again, with faded edges** (replaces the pinned Clear all below): the
  stack, Clear all included, is at most `--notify-max-height` tall (`66.67vh`, `66.67dvh`
  where the browser has `dvh`, so Chrome before 108 and Firefox 100 get a limit too).
  Taller, the messages scroll inside it and Clear all stays at its end. An edge with
  messages beyond it fades out over `--notify-fade` (`2rem`), smoothly where `@property`
  exists; an edge with nothing beyond never fades. No scrollbar; wheel and touch scroll the
  list (also over the gaps while it scrolls: then the list's box takes the pointer, a band
  of 1–1.5rem around the messages included, which a click on the page there doesn't get
  through), `overscroll-behavior: contain`. Tab brings a cross out of sight fully into view,
  clear of the fades and of Clear all; the arrow keys scroll from a focused cross. A new
  message scrolls the list back to its start, unless the keyboard focus or the pointer is
  in the list (the pointer: so that its message doesn't move away under a click).
  **Removed:** `--notify-pin-bottom`, `--notify-pin-top`, the classes `.mm-notify-pinned`
  and `.mm-notify-up`. **Back:** `--notify-max-height` (its default is new: 2/3 of the
  window). The region no longer spans to the far edge, so either `--notify-flow` works from
  either edge again.
- **A message has no 40vh limit of its own:** a long one is shown whole and the list
  scrolls, instead of cutting it.
- **Above popovers opened later:** a new message (or a repeat) after a popover opened over
  the messages raises the region again, without replaying any animation, keeping the focus
  and the scroll. Sites that hid and showed the region themselves can drop that.
- **`@mmutils/notify/css`:** exports `css`, the minified CSS string the package injects,
  for a site's own checks or build. Its own entry, so it adds nothing to the others.
- **`announce: false` no longer uses `aria-hidden`** (axe `aria-hidden-focus`: it hid a
  focusable close button). The message's box is `aria-live="off"` instead: out of the live
  region, not announced when it appears, still in the accessibility tree and the Tab order
  with its named close button. An announced repeat of it joins the live region (an error as
  `role="alert"`) and is read. Announced messages are unchanged.
- `npm run size`: 3438 B, guard raised from 3100 to 3500 B (the user's decision).

From the aesweets.com integration review (2026-11-08):

- **Default durations:** alert closes after 8 s and error after 10 s, so nothing stays until
  closed by default. `timeoutMs: 0`, or `0` in `configure({ durations })`, still keeps one.
- **`configure({ repeats })`, default `false`:** the same kind and text as a message still on
  screen shows no second message; the one on screen starts over with the longer of the two
  times (`0` the longest, so a repeat never shortens it) and is read out again unless the
  repeat has `announce: false`, also when it was shown unannounced. `true` shows every call,
  as before. `showFlash` follows the same rule.
- **Clear all is pinned when the stack doesn't fit the window** (replaced the next day by the scrolling stack above): a full row at the far edge
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
