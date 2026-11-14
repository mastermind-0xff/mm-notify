# @mmutils/notify

Small on-page notifications for the browser. Four kinds, plain text, and one
message carried across a redirect. Built to cost nothing until it is used: the
code and its CSS arrive with the first message.

- 4.3 KB minified and gzipped, CSS included. No dependencies.
- A message can change while it is up: new words or a new kind, a progress bar, a
  console-like log. Work in the background is tracked in one message that becomes
  its outcome.
- No side effects on import, no DOM access until the first call. It imports
  cleanly on the server.
- The CSS comes with the module, so pages carry none of it inline, and it needs no
  bundler plugin. A strict `style-src` doesn't block it.
- A manual popover, so messages sit in the top layer. A browser without popover gets
  a plain fixed element and nothing throws.
- A live region for screen readers, `role="alert"` for errors, DOM APIs only (passes
  Trusted Types).

Work in progress: nothing is published yet.

## Use it on first use

```js
// The page's eager code. `hasFlash` is 123 B gzipped and loads nothing else.
import { hasFlash } from '@mmutils/notify/has-flash';

let loading;
const load = () => (loading ??= import('@mmutils/notify'));

// A message left by the previous page? Only then the rest is fetched.
if (hasFlash()) {
  void load().then(({ showFlash }) => {
    showFlash();
  });
}

// Whenever there is something to say.
export function notify(text, kind) {
  void load().then(({ toast }) => {
    toast(text, kind);
  });
}

// Before a redirect. The next page needs this module anyway to show the message.
export function goTo(url, text) {
  void load()
    .then(({ flash }) => {
      flash(text);
    })
    .finally(() => {
      location.assign(url);
    });
}
```

A bundler that splits code (esbuild with `splitting`, for one) turns the dynamic
import into a lazy chunk. Keep the one promise: separate `import()` calls may resolve
in any order while the file loads, and messages shown together would change places
(seen in Chrome). A plain `import { toast } from '@mmutils/notify'` works too, inside
code that is already lazy.

Importing on the server is safe. There `flash` and `showFlash` do nothing and
`hasFlash` says `false`; `toast` needs a document, so call it only in the browser.

## API

`toast`, `flash`, `showFlash` and `configure` come from `@mmutils/notify`, with the types
`ToastKind`, `ToastOptions`, `ToastHandle` and `NotifyConfig`.

### `toast(text, kind = 'neutral', options?)`

Shows a message and returns its handle, to change it later (see "Changing a message";
code that ignores it works as before). `kind` is `'success'`, `'error'`, `'alert'` or
`'neutral'`; empty text shows nothing and returns a handle that is already closed.
Options:

| Option       | Default             | Meaning                                                                  |
| ------------ | ------------------- | ------------------------------------------------------------------------ |
| `timeoutMs`  | by kind             | Milliseconds on screen. `0` keeps it until closed.                       |
| `announce`   | `true`              | `false`: not read out when it appears, when a status line says the same. |
| `closeLabel` | `Close the message` | The close button's label.                                                |

- Default durations: success and neutral 5 s, alert 8 s, error 10 s. Nothing stays
  until closed unless asked: `timeoutMs: 0`, or `0` in `configure({ durations })`.
- The same kind and text as a message still on screen shows no second message: the one
  on screen starts over, with the longer of its own time and the repeat's (`0`, until
  closed, is the longest), so a repeat never shortens it. Unless the repeat has
  `announce: false` it is read out again, also when it was shown with `announce: false`.
  Its close label stays. `configure({ repeats: true })` shows every call as its own
  message, the same text too. `showFlash` shows through `toast`, so the same rule applies.
- The time runs only while neither the pointer nor the focus is on the message, and
  starts over in full when both have left.
- The text goes through `textContent`. There are no HTML messages.
- Screen readers: the messages sit in a polite live region, an error as `role="alert"`.
  With `announce: false` the message's own box is `aria-live="off"`, which takes it out of
  that region: it is not read out when it appears, but it stays in the accessibility tree
  with its named close button, reachable by Tab (no `aria-hidden`, so axe's
  `aria-hidden-focus` holds). An announced repeat of it joins the live region and is read.

A new message comes in at the start of the stack: on top for the top positions, at the
bottom for the bottom positions (`--notify-flow`, see "Position"). It grows into place, so
the rest of the stack moves out of its way smoothly.

From three messages a **Clear all** button fades in, which closes them all, those that
stay until closed too. It sits at the far end of the stack: below the messages at the top,
above them at the bottom.

**A tall stack scrolls.** The stack, Clear all included, takes at most 2/3 of the window
(`--notify-max-height`: `66.67vh`, `66.67dvh` where the browser has `dvh`). Taller, the
messages scroll inside it and Clear all stays at its end, on screen and never over a
message. An edge with messages beyond it fades out (a mask over `--notify-fade`, 2rem), and
only then: at the start of the list only the far edge fades, and an edge with nothing
beyond it never hides anything. Where the browser has `@property` (Chrome 85, Safari 16.4,
Firefox 128) the fade comes and goes in 0.3 s; elsewhere it switches. There is no
scrollbar (the fades would cut it, and it would narrow the messages): the wheel and touch
scroll the list, gaps between messages included, and `overscroll-behavior: contain` keeps
the page still at its end (Safari 16 and later). Tab brings a close cross that is out of
sight fully into view, clear of the fades and of Clear all (`scroll-padding`), and the
arrow keys scroll the list from a focused cross.

While it scrolls, the list's whole box takes the pointer, so that the wheel doesn't fall
through a gap to the page. That box reaches a little past the messages (room for their
glow and the slide-in: 1.25rem above them, 1.5rem below, 1rem at the sides), so there a
click doesn't reach the page either, until the stack is short enough again. Under a sticky
header, the band above a top stack lies over the header's lower edge.
A stack that fits lets the pointer through everywhere but the messages and Clear all.

A new message comes in at the start of the list, so the list scrolls back there to show
it, unless someone is in the list: the keyboard focus, which stays where it is, in sight,
or the pointer, which would otherwise find another message under it (and close that one
with the click it was about to make). If the list was scrolled away from its start, the new
message then comes in out of sight, beyond the faded edge, and the live region reads it
out. On a touch screen a tapped message can keep its hover until the next tap elsewhere,
and with it the list's place.

**Above popovers opened later.** The top layer stacks by opening order, so a popover (a
menu) opened while messages show would sit above them, and above later messages too. A
new message (or a repeat) after such a popover opens the region again, which puts it on
top. Nothing on screen changes: no animation runs again, the scroll stays, and the focus
stays where it was (given back with `preventScroll` if a browser moves it). Browsers
without popover have no top layer: nothing to do there. Dialogs are left alone, and so is
a popover inside a shadow root: the event that tells of it doesn't leave the root.

### Changing a message: the handle

`toast()` returns a `ToastHandle`. It changes the message in place, so work in the
background (an upload, a job on the server, a slow request) is one message from start
to outcome. Each method but `close` returns the handle, to chain.

| Member                           | What it does                                                                                                                                                    |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `update(text, kind?, options?)`  | New words, and a new kind if given. The progress bar and the log stay. An empty text keeps the words (`update('', 'alert')` changes only the kind).             |
| `replace(text, kind?, options?)` | New contents altogether, as `toast(text, kind, options)` would show them, in place: no bar, no log, the kind's time. The kind stays when not given.             |
| `progress(value, text?)`         | A progress bar under the text: a number from 0 to 1, `true` while the amount is unknown, `false` to remove it. `text` is what screen readers say for the value. |
| `log(line)`                      | Adds a line to a log under the text: monospaced, the newest at the bottom, about six lines in sight, then it scrolls inside the message.                        |
| `close()`                        | Closes the message, as its cross does.                                                                                                                          |
| `closed`                         | `true` once the message is closed, for whatever reason (or never showed).                                                                                       |
| `whenClosed`                     | A promise fulfilled when it closes: stop polling, close an `EventSource`.                                                                                       |

`options` take the same `timeoutMs`, `announce` and `closeLabel` as `toast()`.

```js
// A job on the server, polled: the bar holds the message until the outcome replaces it.
const job = toast('Exporting your orders…').progress(0);
try {
  while (!job.closed) {
    const state = await (await fetch(`/api/jobs/${id}`)).json();
    if (state.finished) {
      job.replace(`Exported ${state.total} files.`, 'success');
      break;
    }
    job
      .update(`Exporting your orders: ${state.done} of ${state.total} files…`)
      .progress(state.progress, `${state.done} of ${state.total} files`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
} catch {
  // A bar waits for its outcome: a failure is one too, or the bar stays up.
  job.replace('The export stopped. Please try again.', 'error');
}

// Console-like lines pushed by the server; the log stays with the outcome.
const deploy = toast('Deploying…').progress(true);
const source = new EventSource('/api/deploy/log');
void deploy.whenClosed.then(() => source.close());
source.onmessage = (event) => deploy.log(event.data);
source.addEventListener('done', () => {
  source.close();
  deploy.progress(false).update('Deployed.', 'success');
});
source.onerror = () => {
  source.close(); // or it reconnects, and the bar waits for good
  deploy.progress(false).update('The deploy lost its connection.', 'error');
};

// A request that may be slow: a progress message only past 2 s, then the outcome.
let saving;
const slow = setTimeout(() => {
  saving = toast('Still saving…', 'neutral', { announce: false }).progress(
    true
  );
}, 2000);
let text = 'Saved.';
let kind = 'success';
try {
  const answer = await fetch('/api/save', { method: 'POST', body });
  if (!answer.ok) [text, kind] = ['Saving failed.', 'error'];
} catch {
  [text, kind] = ['The server is not reachable.', 'error'];
} finally {
  clearTimeout(slow); // whatever happens: a late "Still saving…" would stay up
}
if (saving && !saving.closed) saving.replace(text, kind);
else toast(text, kind);
```

Every way the work can end must reach the message: a bar holds it until its outcome,
so a request that throws and never says so leaves it up (its cross still closes it).

The package has no network code: where the updates come from is the page's business
(`fetch`, `EventSource`, a `WebSocket`, a worker). `npm run examples` has all three of
these against a pretend backend.

**The time.**

- While a progress bar shows, the time doesn't run: the message waits for its outcome,
  however long the work takes. Removing the bar (`progress(false)`, or `replace()`)
  starts the time over in full.
- Every other change (`update`, `replace`, a `log` line) starts the time over in full,
  so new words are on screen long enough to be read. Hovering and focusing still hold it,
  and `sequential` still runs one timer at a time (a message with a bar holds the line,
  like one that stays until closed).
- Which time: `update` keeps the message's time, unless it passes `timeoutMs` or changes
  the kind, which takes that kind's default (a permanent "Saving…" that becomes
  `'success'` closes after 5 s). `replace` takes the kind's default, or `timeoutMs`, as
  `toast()` does.
- A log without a bar keeps a message up only while lines come: for a long job, give it
  a bar or `timeoutMs: 0`.

**Closed is closed.** Once the reader closes the message (its cross, Clear all), or its
time runs out, every method does nothing: the message doesn't come back, and nothing
throws, so a job may go on calling `update`. Check `closed`, or wait for `whenClosed`, to
stop the work's updates; show a new `toast()` if the outcome must still be said.

**Screen readers.**

- `toast()` announces as before. `update` with new words of the same kind is silent by
  default (step texts would flood a screen reader); a new kind is read out (the outcome),
  and `announce` decides either way. `replace` is read out unless `announce: false`.
  Before the message is on screen (its first frame), new words keep the announcement it
  came with, so an announced message is read out with its latest words.
  Silent means the message's box is `aria-live="off"` from then on, as with
  `announce: false`; the next change that is read out joins the live region again, an
  error as `role="alert"`.
- The bar is a `role="progressbar"` named by the message's text (`aria-labelledby`),
  with `aria-valuenow` from 0 to 100, or none while the amount is unknown (which ARIA
  reads as indeterminate), and `aria-valuetext` when given. Its ticks are never
  announced; a screen reader finds the value when it goes to the bar.
- The log is a `role="log"` with `aria-live="off"`: its lines are not read out one by
  one; it is in the accessibility tree and the Tab order (after the close button), so a
  keyboard can scroll it. To say a milestone, `update(text, kind, { announce: true })`.
- Reduced motion: the bar's fill doesn't glide, and a bar with no amount stands still,
  filled in a half tone, instead of the stretch that runs across it.

**Repeats.** A `toast()` with the kind and text of a message on screen shows no second
message and returns that message's handle (unless `configure({ repeats: true })`). Two
pieces of work that start with the same text then share one message, and the last
change wins: give them different texts ("Saving your address…", "Saving your card…") or
turn on `repeats`. A repeat compares with what a message says now, after its updates.
An update never merges messages: a message whose new words equal another's keeps its
place, and both show; a later repeat goes to the older one. A closed message is no
repeat target.

**Its height.** The message grows and shrinks with its contents, at once, without the
growth animation of a new message; a long log scrolls inside it, so the stack keeps its
2/3 of the window.

### `flash(text, kind = 'success', key?)`, `showFlash(key?)`, `hasFlash(key?)`

`flash` leaves one message for the next page in `sessionStorage`, `showFlash` shows
it once, `hasFlash` (from `@mmutils/notify/has-flash`) says whether one waits. The
stored value is treated as untrusted: a broken one is removed and shows nothing, an
unknown kind becomes neutral. When storage is off the message is lost and nothing
throws. The default key is `mm-notify.flash`; pass `key` to all three to use another.

### `configure(options)`

Changes the defaults, once, before the first message. It lives in the lazy module, so
the natural place is a small module of your own that you import instead:

```js
// my-notify.js, imported on first use
import { configure } from '@mmutils/notify';

configure({
  closeLabel: 'Fermer',
  clearAllLabel: 'Tout effacer',
  durations: { error: 10_000 }, // errors close by themselves after 10 s
  sequential: true,
  injectCss: false, // only if the page loads the CSS itself, see "The CSS"
});

export { flash, showFlash, toast } from '@mmutils/notify';
```

| Option          | Default             | Meaning                                                           |
| --------------- | ------------------- | ----------------------------------------------------------------- |
| `closeLabel`    | `Close the message` | The close button's label, for screen readers.                     |
| `clearAllLabel` | `Clear all`         | The clear-all button's text.                                      |
| `clearAllFrom`  | `3`                 | How many messages bring up that button. `0` or `Infinity`: never. |
| `durations`     | see `toast`         | Milliseconds on screen per kind. `0` keeps it until closed.       |
| `repeats`       | `false`             | The same kind and text again shows a new message, see `toast`.    |
| `sequential`    | `false`             | One timer at a time, see below.                                   |
| `logLines`      | `100`               | How many lines a message's log keeps (`log()`), at least 1.       |
| `injectCss`     | `true`              | `false` when the page loads the CSS itself, see "The CSS".        |

**`sequential`:** normally every message counts down at once. With `true` one timer
runs at a time, oldest message first: three messages of 5 s close at 5, 10 and 15 s. A
message's full time starts when the one before has closed, for whatever reason. A
message that stays until closed holds those behind it until someone closes it; those
ahead of it have their turn first. Hovering or focusing the running one holds the line.

## The look

A site changes the look with custom properties. Set them anywhere, `:root` will do:
the package reads each one with its default and never sets them, so yours win in any
cascade order.

| Custom property                                                      | Default                            |
| -------------------------------------------------------------------- | ---------------------------------- |
| `--notify-top`, `--notify-right`, `--notify-bottom`, `--notify-left` | `1rem`, `auto`, `auto`, `50%`      |
| `--notify-shift`: horizontal shift                                   | `-50%`                             |
| `--notify-slide`: where a message slides in from                     | `-1.25rem`                         |
| `--notify-width`                                                     | `min(32rem, calc(100vw - 2rem))`   |
| `--notify-max-height`: the stack, Clear all included                 | `66.67vh` (`66.67dvh` with `dvh`)  |
| `--notify-fade`: how far an edge with more beyond it fades           | `2rem`                             |
| `--notify-color`: the text                                           | `#111`                             |
| `--notify-success`, `--notify-success-glow`                          | `#00e77f`, `rgb(0 213 127 / 0.3)`  |
| `--notify-error`, `--notify-error-glow`                              | `#ef403c`, `rgb(239 64 60 / 0.3)`  |
| `--notify-alert`, `--notify-alert-glow`                              | `#ffd556`, `rgb(255 213 86 / 0.3)` |
| `--notify-neutral`, `--notify-neutral-glow`                          | `#3ec9ff`, `rgb(62 201 255 / 0.3)` |
| `--notify-radius`, `--notify-font-size`                              | `9px`, `1rem`                      |
| `--notify-clear`, `--notify-clear-color`: the clear-all button       | `#111`, `#fff`                     |
| `--notify-flow`: which way the stack grows                           | `column`                           |
| `--notify-log-height`: a log's height, then it scrolls               | `8.4em` (six lines)                |

The default colors keep 4.5:1 with the dark text; white text fails on them. If you
change them, check the contrast yourself. A progress bar is drawn in the text's color
(`--notify-color`), its track in the same color at 20 %, so it follows a dark look. A
log is a lighter panel (white at 20 %), which keeps 4.5:1 for the dark text on every
default color and for a dark look's light text on dark colors. The log's panel and font
have no tokens: a rule as specific as `.mm-notify .mm-notify-log` changes them (the
package's own sheet comes after the page's).

### Position

Top center is the default. A corner is a CSS-only change:

```css
/* top right */
:root {
  --notify-left: auto;
  --notify-right: 1rem;
  --notify-shift: 0;
}

/* bottom left: the messages have 2rem of space of their own below the last one */
:root {
  --notify-top: auto;
  --notify-bottom: 0;
  --notify-left: 1rem;
  --notify-shift: 0;
  --notify-slide: 1.25rem;
  --notify-flow: column-reverse;
}

/* under a fixed header: the stack starts below it */
:root {
  --notify-top: 4.25rem;
}

/* a lower limit, for instance with a fixed bar at the bottom of the screen */
:root {
  --notify-max-height: 60vh;
}
```

The stack starts at `--notify-top` (or stands on `--notify-bottom`) and is as tall as
its messages, up to `--notify-max-height`. Set a value in `vh` there, or `dvh` only
inside `@supports (height: 1dvh)`: a `dvh` value is ignored where the unit is unknown,
and the stack would have no limit. `--notify-flow` turns the order around; either flow
works from either edge.

## The CSS

The first message adds the CSS to the page: a constructable stylesheet
(`document.adoptedStyleSheets`), which a strict `style-src` doesn't block. Browsers
without one (Safari before 16.4, Firefox before 101) get a `<style>`, which needs
`'unsafe-inline'` under a CSP.

To bundle the CSS yourself, for instance to change more than the custom properties,
turn the injection off and load the plain file:

```js
import '@mmutils/notify/notify.css';
import { configure } from '@mmutils/notify';

configure({ injectCss: false });
```

The string stays in the JS in that case, so this is about control, not bytes.

## Browsers

With popover (Chrome 114, Firefox 125, Safari 17) a message sits in the top layer,
above open menus and dialogs. The top layer stacks by opening order: a menu opened after
the messages sits above them until the next message, which raises the region again. Without popover the region is a plain fixed element
with a high `z-index`: it still sits above a sticky header but can end up under a
popover or dialog. The CSS has no nesting and uses `transform` for the same browsers.

## The CSS as a string

`@mmutils/notify/css` exports `css`, the minified string the package injects, for a site
that checks it (a test of its colors) or puts it into its own build:

```js
import { css } from '@mmutils/notify/css';
```

Its own entry: the main entry and `has-flash` don't carry it, and importing it alone
loads no toast code.

## Size

`npm run size` measures what a page pays, bundled by esbuild, and fails above the
budgets (4350 B for the package, a guard; 200 B for the eager check) or when the eager
code would load another chunk. It also imports the built files on Node.

| What                      | Minified | Gzip | Brotli |
| ------------------------- | -------- | ---- | ------ |
| The package, with its CSS | 11247    | 4302 | 3825   |
| `toast` alone             | 10757    | 4088 | 3633   |
| Eager: `hasFlash`         | 115      | 123  | 119    |
| Imported, not used        | 0        | 20   | 1      |

The last row is an empty file: 20 and 1 are what gzip and brotli make of nothing.
The scrolling stack with its fades, the raise above later popovers and the `dvh` fallback
took the package from 3049 B to 3438 B; the guard went from 3100 to 3500 B on the user's word
("3500 is fine", on their earlier "size is not crucial": it loads on first use). The
changing messages took it to 4302 B (the handle about 300 B, the progress bar and the log
about 560 B, CSS included), and the guard to 4350 B: raised by the agent, a question for
the user (a separate entry for the bar and the log would keep the main one near 3750 B).

## As a `file:` dependency

Nothing is on npm yet. In the consuming project's `package.json`, with the path
relative to it:

```json
{ "dependencies": { "@mmutils/notify": "file:../mm-notify" } }
```

`dist` isn't in git, so run `npm install` and `npm run build` here first. npm links
the folder, so a later build is picked up without installing again.

## Examples

```sh
npm run examples
```

Builds the package and serves `examples/` at http://localhost:5179/examples/ with a
strict CSP: all kinds, `timeoutMs` and `announce`, work in the background (a progress bar
polled with `fetch`, log lines from an `EventSource`, a slow request turned into its
outcome, against a pretend backend in `examples/jobs.js`), repeats, sequential timers,
clear all, positions, a dark look, the flash across a reload, a message above an open menu
and a simulated browser without popover.

## Design tool

`npm run examples`, then http://localhost:5179/examples/design.html. It changes real
messages at their real position, through what a site would set, and shows the contrast
of each color as you go. Position, colors, glow, shape, type, spacing, clear all and the
timers. It remembers your design in the browser until you go back to the defaults.

When the design is approved, export what differs from the defaults:

- **Brief for an agent:** the CSS and the settings with instructions and the contrast
  figures, as Markdown. Give this to an agent to set the design.
- **CSS:** for the site's own stylesheet. Custom properties on `:root`, then rules for what
  has none (padding, border, glow shape), more specific than the package's own, so the
  order doesn't matter and the package pays nothing for them.
- **Settings:** the same as JSON (`tokens`, `rules`, `configure`). JSON has no `Infinity`,
  so `clearAllFrom` says `"Infinity"` there as a string.

Its defaults are read from `dist/notify.css` and `config`, and it warns when the CSS has a
custom property it has no control for.

## License

MIT
