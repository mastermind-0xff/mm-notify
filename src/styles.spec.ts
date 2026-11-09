// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { configure as Configure } from './config.js';
import css from './notify.css';
import type { injectStyles as InjectStyles } from './styles.js';

const source = readFileSync(join(import.meta.dirname, 'notify.css'), 'utf8');

let injectStyles: typeof InjectStyles;
let configure: typeof Configure;

/** Fresh modules per test: no sheet made yet. */
beforeEach(async () => {
  vi.resetModules();
  ({ injectStyles } = await import('./styles.js'));
  ({ configure } = await import('./config.js'));
  document.head.replaceChildren();
  document.adoptedStyleSheets = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('injectStyles', () => {
  it('adopts a constructable stylesheet, no <style>', () => {
    injectStyles();
    expect(document.adoptedStyleSheets).toHaveLength(1);
    expect(document.head.querySelector('style')).toBeNull();
    const rules = [...document.adoptedStyleSheets[0]!.cssRules];
    expect(rules.map((rule) => rule.cssText).join('')).toContain(
      '.mm-notify-region'
    );
  });

  it('adds it once, and keeps what the page adopted itself', () => {
    const own = new CSSStyleSheet();
    document.adoptedStyleSheets = [own];
    injectStyles();
    injectStyles();
    expect(document.adoptedStyleSheets).toHaveLength(2);
    expect(document.adoptedStyleSheets[0]).toBe(own);
  });

  describe('falls back to one <style>', () => {
    const fallbackWorks = (): void => {
      injectStyles();
      injectStyles();
      const styles = document.head.querySelectorAll('style');
      expect(styles).toHaveLength(1);
      expect(styles[0]!.id).toBe('mm-notify-css');
      expect(styles[0]!.textContent).toBe(css);
    };

    it('when the constructor throws', () => {
      vi.stubGlobal('CSSStyleSheet', function () {
        throw new TypeError('Illegal constructor');
      });
      fallbackWorks();
    });

    it('when replaceSync is missing', () => {
      vi.stubGlobal('CSSStyleSheet', function () {
        // An object without any methods.
      });
      fallbackWorks();
    });

    it('when the document has no adoptedStyleSheets', () => {
      const getter = vi
        .spyOn(document, 'adoptedStyleSheets', 'get')
        .mockReturnValue(undefined as unknown as CSSStyleSheet[]);
      fallbackWorks();
      getter.mockRestore();
    });
  });

  it('adds nothing with injectCss: false', () => {
    configure({ injectCss: false });
    injectStyles();
    expect(document.adoptedStyleSheets).toHaveLength(0);
    expect(document.head.querySelector('style')).toBeNull();
  });
});

describe('the CSS string', () => {
  it('is minified, without comments', () => {
    expect(css).not.toContain('/*');
    expect(css).not.toContain('\n');
    expect(css.length).toBeLessThan(source.length / 1.3);
  });

  it('survives the minifier with what matters', () => {
    expect(css).toContain('.mm-notify-region{');
    expect(css).toContain('@keyframes mm-notify-in');
    expect(css).toContain('prefers-reduced-motion');
    expect(css).toContain('var(--notify-top,1rem)');
    expect(css).toContain('var(--notify-success,#00e77f)');
    expect(css).toContain('var(--notify-success-glow,rgb(0 213 127/.3))');
    expect(css).toContain('min(32rem,calc(100vw - 2rem)))');
  });
});

describe('notify.css', () => {
  const code = source.replaceAll(/\/\*[\s\S]*?\*\//g, '');

  const rule = (selector: string): string =>
    code.split(`${selector} {`)[1]?.split('}')[0] ?? '';

  it('prefixes every class and keyframe', () => {
    const classes = [...code.matchAll(/\.([a-z][\w-]*)/gi)]
      .map((match) => match[1]!)
      // decimal numbers, like `0.3s`, don't start with a letter; units might
      .filter((name) => !/^\d/.test(name));
    expect(classes.length).toBeGreaterThan(10);
    for (const name of classes) expect(name).toMatch(/^mm-notify/);
    for (const [, name] of code.matchAll(/@keyframes ([\w-]+)/g))
      expect(name).toMatch(/^mm-notify/);
  });

  it('reads every custom property with its default', () => {
    const uses = [...code.matchAll(/var\((--[\w-]+)(,?)/g)];
    expect(uses.length).toBeGreaterThan(10);
    for (const [, name, comma] of uses) {
      // --mm-notify-: set by toast.ts on a message, not for a site to set.
      expect(name).toMatch(/^--(mm-)?notify-/);
      expect(comma, name).toBe(',');
    }
  });

  it('sets none of them itself: a value on :root must win', () => {
    expect(code).not.toMatch(/--notify-[\w-]+\s*:/);
  });

  it('has what browsers without popover need', () => {
    expect(code, 'nesting').not.toMatch(/&/);
    expect(code, 'translate').not.toMatch(/(^|[\s;{])translate\s*:/);
    expect(code, 'rotate').not.toMatch(/(^|[\s;{])rotate\s*:/);
    expect(code).toMatch(/position: fixed/);
    expect(code).toMatch(/z-index: \d+/);
  });

  it('scrolls the messages in a stack of at most 2/3 of the window, clear all included', () => {
    expect(code).toMatch(
      /\.mm-notify-region \{[^}]*inset: var\(--notify-top, 1rem\) var\(--notify-right, auto\)\s+var\(--notify-bottom, auto\) var\(--notify-left, 50%\);/
    );
    // vh first: `var()` with a dvh unknown to the browser would leave no limit at all.
    expect(code).toMatch(
      /\.mm-notify-region \{[^}]*max-height: var\(--notify-max-height, 66\.67vh\);/
    );
    expect(code).toMatch(
      /@supports \(height: 1dvh\) \{\s*\.mm-notify-region \{\s*max-height: var\(--notify-max-height, 66\.67dvh\);\s*\}\s*\}/
    );
    const list = rule('.mm-notify-list');
    expect(list).toContain('overflow-y: auto;');
    expect(list).toContain('overscroll-behavior: contain;');
    expect(list).not.toContain('flex:'); // it shrinks to the room, then scrolls
    // Or they would shrink to fit, instead of scrolling; clear all keeps its size.
    expect(rule('.mm-notify')).toContain('flex: none;');
    expect(rule('.mm-notify-clear')).toContain('flex: none;');
    // A message as tall as its text: the list scrolls, nothing is cut.
    expect(rule('.mm-notify')).not.toContain('max-height');
  });

  it('shows no scrollbar: the fades would cut it, and it would narrow the messages', () => {
    expect(rule('.mm-notify-list')).toContain('scrollbar-width: none;');
    expect(rule('.mm-notify-list::-webkit-scrollbar')).toContain(
      'display: none;'
    );
  });

  it('fades an edge only while toast.ts says there are messages beyond it', () => {
    const list = rule('.mm-notify-list');
    const masks = [
      ...list.matchAll(
        /((?:-webkit-)?mask-image): (linear-gradient\([^;]*\));/g
      ),
    ];
    expect(masks.map((match) => match[1])).toEqual([
      '-webkit-mask-image',
      'mask-image',
    ]);
    expect(masks[0]![2]).toBe(masks[1]![2]);
    // Both 0 (the default, also without @property): opaque from edge to edge.
    for (const edge of ['above', 'below']) {
      expect(masks[0]![2]).toContain(`var(--mm-notify-${edge}, 0)`);
      expect(rule(`.mm-notify-${edge}`)).toContain(`--mm-notify-${edge}: 1;`);
      expect(rule(`.mm-notify-${edge}`)).toContain('pointer-events: auto;');
      expect(code.replaceAll(/\s+/g, ' ')).toContain(
        `@property --mm-notify-${edge} { syntax: '<number>'; inherits: false; initial-value: 0; }`
      );
      expect(list).toContain(`--mm-notify-${edge} 0.3s`);
    }
  });

  it('keeps a focused cross out of the fades and from under clear all', () => {
    expect(rule('.mm-notify-list')).toMatch(
      /scroll-padding: calc\(1\.25rem \+ var\(--notify-fade, 2rem\)\) 0\s+calc\(1\.5rem \+ var\(--notify-fade, 2rem\)\);/
    );
    expect(rule('.mm-notify-close')).toContain('scroll-margin: 0.5rem 0;');
  });

  it('measures a message as content-box, whatever the site sets for all', () => {
    expect(code).toMatch(/\.mm-notify \{[^}]*box-sizing: content-box;/);
  });

  it('turns the whole stack around with one token', () => {
    const flow = 'flex-direction: var(--notify-flow, column);';
    expect(code).toContain(`.mm-notify-region {`);
    for (const selector of ['region', 'list'])
      expect(
        new RegExp(`\\.mm-notify-${selector} \\{[^}]*`).exec(code)?.[0],
        selector
      ).toContain(flow);
  });

  it('grows a new message, so the stack moves instead of jumping', () => {
    const keyframes = /@keyframes mm-notify-in \{[\s\S]*\}\s*\}/.exec(
      code
    )?.[0];
    expect(keyframes).toMatch(/from \{[^}]*max-height: 0;/);
    expect(keyframes).toMatch(/from \{[^}]*padding-block: 0;/);
    expect(keyframes).toMatch(/from \{[^}]*margin-bottom: 0;/);
    expect(keyframes).toMatch(
      /to \{[^}]*max-height: var\(--mm-notify-height, 40vh\);/
    );
  });

  it('fades clear all in and out, out of reach while gone', () => {
    expect(code).toMatch(/\.mm-notify-clear \{[^}]*transition:/);
    const gone = /\.mm-notify-clear\.mm-notify-out \{[^}]*/.exec(code)?.[0];
    expect(gone).toContain('opacity: 0;');
    expect(gone).toContain('visibility: hidden;');
  });

  it('never animates for those who asked not to', () => {
    expect(code).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.mm-notify,\s*\.mm-notify\.mm-notify-out,\s*\.mm-notify\.mm-notify-out > \*,\s*\.mm-notify-list,\s*\.mm-notify-clear \{\s*animation: none;\s*transition: none;/
    );
  });

  it('closes the box in 0.3 s and its children in 0.1 s', () => {
    const box = rule('.mm-notify.mm-notify-out');
    expect(box).toMatch(
      /transition:\s*0\.3s cubic-bezier\([^)]+\),\s*opacity 0\.3s/
    );
    for (const zero of ['max-height', 'margin-block', 'padding-block'])
      expect(box).toContain(`${zero}: 0;`);
    const children = rule('.mm-notify.mm-notify-out > *');
    expect(children).toContain('opacity: 0;');
    expect(children).toMatch(/transition: opacity 0\.1s/);
  });

  it('has no transition on a message at rest: toast.ts sets where closing starts', () => {
    expect(rule('.mm-notify')).not.toContain('transition');
  });

  it('keeps clear all one message gap from the messages', () => {
    const gap = /margin-bottom: (\S+);/.exec(rule('.mm-notify'))?.[1];
    // The list's padding is room for the glow and the slide-in, its margins take it
    // back: below the list the button's negative margin does, so the gap is the message's.
    expect(rule('.mm-notify-list')).toContain('margin: -1.25rem -1rem 0;');
    expect(rule('.mm-notify-list')).toContain('padding: 1.25rem 1rem 1.5rem;');
    expect(rule('.mm-notify-clear')).toContain(
      `margin: -1.5rem auto ${gap ?? '?'};`
    );
  });

  it('moves clear all under the messages, and raises it once it has stopped', () => {
    const gone = rule('.mm-notify-clear.mm-notify-out');
    expect(gone).toContain('z-index: -1;');
    expect(gone).toContain('transition-delay: 0s;');
    expect(rule('.mm-notify-clear')).toContain('z-index: 1;');
    expect(rule('.mm-notify-clear')).toMatch(/z-index 0s 0\.3s/);
  });

  describe('the default look', () => {
    const defaultOf = (token: string): string => {
      const found = new RegExp(
        `var\\(--notify-${token},\\s*([^;]+?)\\)[;)]`,
        's'
      );
      return found.exec(code)?.[1] ?? '';
    };

    it.each([
      ['success', '#00e77f', 'rgb(0 213 127 / 0.3'],
      ['error', '#ef403c', 'rgb(239 64 60 / 0.3'],
      ['alert', '#ffd556', 'rgb(255 213 86 / 0.3'],
      ['neutral', '#3ec9ff', 'rgb(62 201 255 / 0.3'],
    ])('keeps the colors and the glow of %s', (kind, color, glow) => {
      expect(defaultOf(kind)).toBe(color);
      expect(defaultOf(`${kind}-glow`)).toBe(glow);
    });

    /** WCAG relative luminance of `#rrggbb` or `#rgb`. */
    const luminance = (color: string): number => {
      const hex = color.slice(1);
      const full =
        hex.length === 3 ? hex.replaceAll(/./g, (digit) => digit + digit) : hex;
      const [r, g, b] = [0, 2, 4].map((at) => {
        const channel = parseInt(full.slice(at, at + 2), 16) / 255;
        return channel <= 0.04045 ?
            channel / 12.92
          : ((channel + 0.055) / 1.055) ** 2.4;
      }) as [number, number, number];
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };

    it.each(['success', 'error', 'alert', 'neutral'])(
      'keeps 4.5:1 for the text on %s',
      (kind) => {
        const text = luminance(defaultOf('color'));
        const background = luminance(defaultOf(kind));
        const ratio =
          (Math.max(text, background) + 0.05) /
          (Math.min(text, background) + 0.05);
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      }
    );

    it('keeps 4.5:1 on the clear all button', () => {
      const text = luminance(defaultOf('clear-color'));
      const background = luminance(defaultOf('clear'));
      const ratio =
        (Math.max(text, background) + 0.05) /
        (Math.min(text, background) + 0.05);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it('fails white text on purpose: that is why the text is dark', () => {
      const white = 1;
      const worst = Math.max(
        ...['success', 'alert', 'neutral'].map((kind) => {
          const background = luminance(defaultOf(kind));
          return (white + 0.05) / (background + 0.05);
        })
      );
      expect(worst).toBeLessThan(4.5);
    });
  });
});
