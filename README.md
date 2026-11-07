# @mmutils/notify

Small on-page notifications for the browser. Four kinds, plain text, and one
message carried across a redirect. Built to cost nothing until it is used: the
code and its CSS arrive with the first message.

- 2.6 KB minified and gzipped, CSS included. No dependencies.
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
`ToastKind`, `ToastOptions` and `NotifyConfig`.

### `toast(text, kind = 'neutral', options?)`

Shows a message. `kind` is `'success'`, `'error'`, `'alert'` or `'neutral'`; empty
text shows nothing. Options:

| Option       | Default             | Meaning                                                                 |
| ------------ | ------------------- | ----------------------------------------------------------------------- |
| `timeoutMs`  | by kind             | Milliseconds on screen. `0` keeps it until closed.                      |
| `announce`   | `true`              | `false` hides it from screen readers, when a status line says the same. |
| `closeLabel` | `Close the message` | The close button's label.                                               |

- Default durations: success and neutral 5 s. Alert and error stay until closed.
- Every call shows its own message, the same text too: an action can happen twice.
- The time runs only while neither the pointer nor the focus is on the message, and
  starts over in full when both have left.
- The text goes through `textContent`. There are no HTML messages.

A new message comes in at the start of the stack: on top for the top positions, at the
bottom for the bottom positions (`--notify-flow`, see "Position"). It grows into place, so
the rest of the stack moves out of its way smoothly.

From three messages a **Clear all** button fades in, which closes them all, those that
stay until closed too. It sits at the far end of the stack: below the messages at the top,
above them at the bottom. When the messages don't fit the window they scroll, under the
wheel or a finger on a message, and the newest and the button stay on screen.

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
| `sequential`    | `false`             | One timer at a time, see below.                                   |
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
| `--notify-max-height`                                                | `calc(100dvh - 2rem)`              |
| `--notify-color`: the text                                           | `#111`                             |
| `--notify-success`, `--notify-success-glow`                          | `#00e77f`, `rgb(0 213 127 / 0.3)`  |
| `--notify-error`, `--notify-error-glow`                              | `#ef403c`, `rgb(239 64 60 / 0.3)`  |
| `--notify-alert`, `--notify-alert-glow`                              | `#ffd556`, `rgb(255 213 86 / 0.3)` |
| `--notify-neutral`, `--notify-neutral-glow`                          | `#3ec9ff`, `rgb(62 201 255 / 0.3)` |
| `--notify-radius`, `--notify-font-size`                              | `9px`, `1rem`                      |
| `--notify-clear`, `--notify-clear-color`: the clear-all button       | `#111`, `#fff`                     |
| `--notify-flow`: which way the stack grows                           | `column`                           |

The default colors keep 4.5:1 with the dark text; white text fails on them. If you
change them, check the contrast yourself.

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

/* under a sticky header: the height keeps the messages and the button on screen */
:root {
  --notify-top: 4.25rem;
  --notify-max-height: calc(100dvh - 5.25rem);
}
```

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
above open menus and dialogs. The top layer stacks by opening order, so a menu opened
after a message sits above it. Without popover the region is a plain fixed element
with a high `z-index`: it still sits above a sticky header but can end up under a
popover or dialog. The CSS has no nesting and uses `transform` for the same browsers.

## Size

`npm run size` measures what a page pays, bundled by esbuild, and fails above the
budgets (2700 B for the package, 200 B for the eager check) or when the eager code
would load another chunk. It also imports the built files on Node.

| What                      | Minified | Gzip | Brotli |
| ------------------------- | -------- | ---- | ------ |
| The package, with its CSS | 6118     | 2570 | 2230   |
| `toast` alone             | 5636     | 2355 | 2052   |
| Eager: `hasFlash`         | 115      | 123  | 119    |
| Imported, not used        | 0        | 20   | 1      |

The last row is an empty file: 20 and 1 are what gzip and brotli make of nothing.

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
strict CSP: all kinds, `timeoutMs` and `announce`, sequential timers, clear all,
positions, a dark look, the flash across a reload, a message above an open menu and a
simulated browser without popover.

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
