# @mmutils/notify

Small on-page notifications for the browser. Four kinds, plain text, and one
message carried across a redirect. Built to cost nothing until it is used: the
code and its CSS arrive with the first message.

- 2.4 KB minified and gzipped, CSS included. No dependencies.
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
// The page's eager code. 123 bytes, and it loads nothing else.
import { hasFlash } from '@mmutils/notify/has-flash';

// A message left by the previous page? Only then the rest is fetched.
if (hasFlash()) {
  void import('@mmutils/notify').then(({ showFlash }) => {
    showFlash();
  });
}

// Whenever there is something to say.
export function notify(text, kind) {
  void import('@mmutils/notify').then(({ toast }) => {
    toast(text, kind);
  });
}

// Before a redirect. The next page needs this module anyway to show the message.
export function goTo(url, text) {
  void import('@mmutils/notify')
    .then(({ flash }) => {
      flash(text);
    })
    .finally(() => {
      location.assign(url);
    });
}
```

A bundler that splits code (esbuild with `splitting`, for one) turns the dynamic
import into a lazy chunk. A plain `import { toast } from '@mmutils/notify'` works too,
inside code that is already lazy.

Importing on the server is safe. There `flash` and `showFlash` do nothing and
`hasFlash` says `false`; `toast` needs a document, so call it only in the browser.

## API

### `toast(text, kind = 'neutral', options?)`

Shows a message. `kind` is `'success'`, `'error'`, `'alert'` or `'neutral'`; empty
text shows nothing. Options:

| Option       | Default             | Meaning                                                                 |
| ------------ | ------------------- | ----------------------------------------------------------------------- |
| `timeoutMs`  | by kind             | Milliseconds on screen. `0` keeps it until closed.                      |
| `announce`   | `true`              | `false` hides it from screen readers, when a status line says the same. |
| `closeLabel` | `Close the message` | The close button's label.                                               |

- Default durations: success and neutral 5 s, alert 8 s, error 10 s.
- The same text again replaces the first and restarts the time.
- The time runs only while neither the pointer nor the focus is on the message.
- The text goes through `textContent`. There are no HTML messages.

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
  durations: { error: 0 }, // errors stay until closed
  injectCss: false, // see "The CSS"
});

export { flash, showFlash, toast } from '@mmutils/notify';
```

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

/* bottom left: the region has its own 2rem of space below the last message */
:root {
  --notify-top: auto;
  --notify-bottom: 0;
  --notify-left: 1rem;
  --notify-shift: 0;
  --notify-slide: 1.25rem;
}

/* under a sticky header */
:root {
  --notify-top: 4.25rem;
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
budgets (2500 B for the package, 200 B for the eager check) or when the eager code
would load another chunk. It also imports the built files on Node.

| What                      | Minified | Gzip | Brotli |
| ------------------------- | -------- | ---- | ------ |
| The package, with its CSS | 5451     | 2392 | 2077   |
| `toast` alone             | 4934     | 2159 | 1868   |
| Eager: `hasFlash`         | 115      | 123  | 119    |
| Imported, not used        | 0        | 0    | 0      |

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
strict CSP: all kinds, the options, positions, a dark look, the flash across a reload,
a message above an open menu and a simulated browser without popover.

## License

MIT
