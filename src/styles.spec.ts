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
    expect(css).toContain('var(--notify-top, 1rem)');
    expect(css).toContain('var(--notify-success, #00e77f)');
  });
});

describe('notify.css', () => {
  const code = source.replaceAll(/\/\*[\s\S]*?\*\//g, '');

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
      expect(name).toMatch(/^--notify-/);
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

  it('never animates for those who asked not to', () => {
    expect(code).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.mm-notify \{\s*animation: none;\s*transition: none;/
    );
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
