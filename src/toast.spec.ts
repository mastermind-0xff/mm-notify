// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentBrowser, isOpen, olderBrowser } from './test-utils/browsers.js';
import type { configure as Configure, ToastKind } from './config.js';
import type { showFlash as ShowFlash, toast as Toast } from './toast.js';

const KINDS: readonly ToastKind[] = ['success', 'error', 'alert', 'neutral'];

let toast: typeof Toast;
let showFlash: typeof ShowFlash;
let configure: typeof Configure;
let undoBrowser: () => void;

/** Fresh modules per test: the region and the settings start from the start. */
async function load(): Promise<void> {
  vi.resetModules();
  ({ toast, showFlash } = await import('./toast.js'));
  ({ configure } = await import('./config.js'));
}

const region = (): HTMLElement =>
  document.querySelector<HTMLElement>('.mm-notify-region')!;

const items = (): HTMLElement[] => [
  ...document.querySelectorAll<HTMLElement>('.mm-notify'),
];

const showing = (): HTMLElement[] =>
  items().filter((item) => !item.classList.contains('mm-notify-out'));

/** Runs the pending `requestAnimationFrame` callbacks. */
const nextFrame = (): void => {
  vi.advanceTimersToNextFrame();
};

const fire = (element: Element, ...events: string[]): void => {
  for (const event of events) element.dispatchEvent(new Event(event));
};

beforeEach(async () => {
  vi.useFakeTimers();
  document.head.replaceChildren();
  document.body.replaceChildren();
  undoBrowser = currentBrowser();
  await load();
});

afterEach(() => {
  vi.useRealTimers();
  undoBrowser();
});

describe('toast: the kinds', () => {
  it('shows the text with the class of its kind', () => {
    for (const kind of KINDS) toast(`A ${kind}`, kind);
    nextFrame();
    expect(items().map((item) => item.className)).toEqual(
      KINDS.map((kind) => `mm-notify mm-notify-${kind}`)
    );
    expect(items().map((item) => item.querySelector('p')!.textContent)).toEqual(
      KINDS.map((kind) => `A ${kind}`)
    );
  });

  it('is neutral by default', () => {
    toast('Hello');
    nextFrame();
    expect(items()[0]!.classList).toContain('mm-notify-neutral');
  });

  it('draws an icon of its own per kind, hidden from screen readers', () => {
    for (const kind of KINDS) toast(`A ${kind}`, kind);
    nextFrame();
    const svgs = items().map((item) => item.querySelector('svg')!);
    for (const svg of svgs) {
      expect(svg.getAttribute('aria-hidden')).toBe('true');
      expect(svg.namespaceURI).toBe('http://www.w3.org/2000/svg');
    }
    expect(new Set(svgs.map((svg) => svg.innerHTML)).size).toBe(KINDS.length);
  });

  it('ignores empty text', () => {
    toast('');
    nextFrame();
    expect(region()).toBeNull();
  });
});

describe('toast: how long it stays', () => {
  it.each([
    ['success', 5000],
    ['neutral', 5000],
    ['alert', 8000],
    ['error', 10_000],
  ] as const)('closes %s after %d ms', (kind, duration) => {
    toast('Bye', kind);
    nextFrame();
    vi.advanceTimersByTime(duration - 1);
    expect(showing()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(showing()).toHaveLength(0);
  });

  it('takes timeoutMs', () => {
    toast('Bye', 'error', { timeoutMs: 100 });
    nextFrame();
    vi.advanceTimersByTime(99);
    expect(showing()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(showing()).toHaveLength(0);
  });

  it('stays until closed with timeoutMs: 0', () => {
    toast('Stay', 'success', { timeoutMs: 0 });
    nextFrame();
    vi.advanceTimersByTime(3_600_000);
    expect(showing()).toHaveLength(1);
    fire(items()[0]!, 'pointerenter', 'pointerleave', 'focusin', 'focusout');
    vi.advanceTimersByTime(3_600_000);
    expect(showing()).toHaveLength(1);
    items()[0]!.querySelector('button')!.click();
    expect(showing()).toHaveLength(0);
  });

  it('takes the durations from configure', () => {
    configure({ durations: { success: 50 } });
    toast('Bye', 'success');
    nextFrame();
    vi.advanceTimersByTime(50);
    expect(showing()).toHaveLength(0);
  });
});

describe('toast: the popover', () => {
  it('is a manual popover, opened with the first toast', () => {
    toast('Hello');
    expect(region().getAttribute('popover')).toBe('manual');
    expect(isOpen(region())).toBe(true);
  });

  it('stays open for the next one and closes after the last', () => {
    toast('One');
    toast('Two');
    nextFrame();
    expect(isOpen(region())).toBe(true);
    for (const item of items()) fire(item.querySelector('button')!, 'click');
    fire(items()[0]!, 'transitionend');
    expect(items()).toHaveLength(1);
    expect(isOpen(region())).toBe(true);
    fire(items()[0]!, 'transitionend');
    expect(items()).toHaveLength(0);
    expect(isOpen(region())).toBe(false);
  });

  it('opens again for a later toast', () => {
    toast('One');
    nextFrame();
    fire(items()[0]!.querySelector('button')!, 'click');
    vi.advanceTimersByTime(400);
    expect(isOpen(region())).toBe(false);
    toast('Two');
    nextFrame();
    expect(isOpen(region())).toBe(true);
    expect(showing()).toHaveLength(1);
  });
});

describe('toast: screen readers', () => {
  it('has one polite live region, created once', () => {
    toast('One');
    toast('Two', 'success');
    nextFrame();
    toast('Three', 'alert');
    nextFrame();
    expect(document.querySelectorAll('.mm-notify-region')).toHaveLength(1);
    expect(region().getAttribute('aria-live')).toBe('polite');
    expect(items().every((item) => item.parentElement === region())).toBe(true);
  });

  it('adds the item on the next frame, to an existing region', () => {
    toast('Hello');
    expect(region()).not.toBeNull();
    expect(items()).toHaveLength(0);
    nextFrame();
    expect(items()).toHaveLength(1);
  });

  it('gives errors role="alert", the others none', () => {
    for (const kind of KINDS) toast(`A ${kind}`, kind);
    nextFrame();
    expect(items().map((item) => item.getAttribute('role'))).toEqual([
      null,
      'alert',
      null,
      null,
    ]);
  });

  it('hides it from them with announce: false', () => {
    toast('Said by the status line', 'error', { announce: false });
    nextFrame();
    expect(items()[0]!.getAttribute('aria-hidden')).toBe('true');
    expect(items()[0]!.getAttribute('role')).toBeNull();
  });

  it('builds again when the region was taken out of the page', () => {
    toast('One');
    nextFrame();
    document.body.replaceChildren();
    toast('Two');
    nextFrame();
    expect(document.querySelectorAll('.mm-notify-region')).toHaveLength(1);
    expect(items()).toHaveLength(1);
  });
});

describe('toast: the same text twice', () => {
  it('replaces the first', () => {
    toast('Saved', 'success');
    nextFrame();
    const first = items()[0]!;
    vi.advanceTimersByTime(1000);
    toast('Saved', 'success');
    expect(first.classList).toContain('mm-notify-out');
    nextFrame();
    expect(showing()).toHaveLength(1);
    expect(showing()[0]).not.toBe(first);
    vi.advanceTimersByTime(4000);
    expect(showing()).toHaveLength(1);
  });

  it('leaves other texts alone', () => {
    toast('One');
    nextFrame();
    toast('Two');
    nextFrame();
    expect(showing()).toHaveLength(2);
  });
});

describe('toast: hover and focus hold the timer', () => {
  it('holds while the pointer is on it, and counts again after', () => {
    toast('Hold', 'success');
    nextFrame();
    const item = items()[0]!;
    fire(item, 'pointerenter');
    vi.advanceTimersByTime(60_000);
    expect(showing()).toHaveLength(1);
    fire(item, 'pointerleave');
    vi.advanceTimersByTime(4999);
    expect(showing()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(showing()).toHaveLength(0);
  });

  it('holds while the focus is on it, and counts again after', () => {
    toast('Hold', 'success');
    nextFrame();
    const item = items()[0]!;
    fire(item, 'focusin');
    vi.advanceTimersByTime(60_000);
    expect(showing()).toHaveLength(1);
    fire(item, 'focusout');
    vi.advanceTimersByTime(4999);
    expect(showing()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(showing()).toHaveLength(0);
  });
});

describe('toast: plain text only', () => {
  it('never parses the text', () => {
    const text = '<img src=x onerror="alert(1)"><b>bold</b> & more';
    toast(text);
    nextFrame();
    const message = items()[0]!.querySelector('p')!;
    expect(message.textContent).toBe(text);
    expect(message.children).toHaveLength(0);
    expect(document.querySelector('img')).toBeNull();
  });

  it('has no innerHTML in the source (Trusted Types)', () => {
    for (const file of ['toast.ts', 'styles.ts', 'flash.ts'])
      expect(
        readFileSync(join(import.meta.dirname, file), 'utf8'),
        file
      ).not.toMatch(/\.(inner|outer)HTML|insertAdjacentHTML|document\.write/);
  });
});

describe('toast: closing', () => {
  it('has a labeled button that closes it', () => {
    toast('Hello');
    nextFrame();
    const button = items()[0]!.querySelector('button')!;
    expect(button.type).toBe('button');
    expect(button.getAttribute('aria-label')).toBe('Close the message');
    button.click();
    expect(items()[0]!.classList).toContain('mm-notify-out');
  });

  it('takes the label from the options, then from configure', () => {
    configure({ closeLabel: 'Fermer' });
    toast('One');
    toast('Two', 'neutral', { closeLabel: 'Schließen' });
    nextFrame();
    expect(
      items().map((item) =>
        item.querySelector('button')!.getAttribute('aria-label')
      )
    ).toEqual(['Fermer', 'Schließen']);
  });

  it('is removed when the transition ends', () => {
    toast('Hello');
    nextFrame();
    items()[0]!.querySelector('button')!.click();
    expect(items()).toHaveLength(1);
    fire(items()[0]!, 'transitionend');
    expect(items()).toHaveLength(0);
  });

  it('is removed without any transition too (reduced motion)', () => {
    toast('Hello');
    nextFrame();
    items()[0]!.querySelector('button')!.click();
    vi.advanceTimersByTime(399);
    expect(items()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(items()).toHaveLength(0);
  });

  it('closes once, however often it is asked', () => {
    toast('Hello', 'neutral', { timeoutMs: 100 });
    nextFrame();
    const item = items()[0]!;
    const spy = vi.spyOn(item, 'addEventListener');
    item.querySelector('button')!.click();
    item.querySelector('button')!.click();
    vi.advanceTimersByTime(100);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

// Plan §4: found by reading the original code, each reproduced here first.
describe('fix: browsers without popover', () => {
  beforeEach(() => {
    undoBrowser();
    undoBrowser = olderBrowser();
  });

  it('shows the toast as a plain element and does not throw', () => {
    expect(() => {
      toast('Hello', 'error');
    }).not.toThrow();
    nextFrame();
    expect(showing()).toHaveLength(1);
    expect(items()[0]!.parentElement).toBe(region());
    expect(region().parentElement).toBe(document.body);
  });

  it('removes the last toast without throwing', () => {
    toast('Hello');
    nextFrame();
    items()[0]!.querySelector('button')!.click();
    expect(() => {
      fire(items()[0]!, 'transitionend');
    }).not.toThrow();
    expect(items()).toHaveLength(0);
    expect(() => {
      vi.advanceTimersByTime(400);
    }).not.toThrow();
  });
});

describe('fix: the timer only runs when nothing holds it', () => {
  it('restarts the whole count after a hover', () => {
    toast('Hold', 'success');
    nextFrame();
    const item = items()[0]!;
    vi.advanceTimersByTime(3000);
    fire(item, 'pointerenter', 'pointerleave');
    vi.advanceTimersByTime(3000);
    expect(showing()).toHaveLength(1);
    vi.advanceTimersByTime(2000);
    expect(showing()).toHaveLength(0);
  });

  it('leaves no stale timer that closes it while hovered', () => {
    toast('Hold', 'success');
    nextFrame();
    const item = items()[0]!;
    // Focus and pointer come and go: two countdowns would start, one survive.
    fire(item, 'focusin', 'pointerenter', 'pointerleave', 'focusout');
    fire(item, 'pointerenter');
    vi.advanceTimersByTime(60_000);
    expect(showing()).toHaveLength(1);
  });

  it('holds on while focused when the pointer moves away', () => {
    toast('Hold', 'success');
    nextFrame();
    const item = items()[0]!;
    fire(item, 'focusin', 'pointerenter', 'pointerleave');
    vi.advanceTimersByTime(60_000);
    expect(showing()).toHaveLength(1);
    fire(item, 'focusout');
    vi.advanceTimersByTime(5000);
    expect(showing()).toHaveLength(0);
  });

  it('holds on while hovered when the focus moves away', () => {
    toast('Hold', 'success');
    nextFrame();
    const item = items()[0]!;
    fire(item, 'pointerenter', 'focusin', 'focusout');
    vi.advanceTimersByTime(60_000);
    expect(showing()).toHaveLength(1);
    fire(item, 'pointerleave');
    vi.advanceTimersByTime(5000);
    expect(showing()).toHaveLength(0);
  });
});

// Found while porting: not in plan §4, same treatment.
describe('fix: the same text twice in one frame', () => {
  it('shows it once', () => {
    toast('Saved', 'success');
    toast('Saved', 'success');
    nextFrame();
    expect(showing()).toHaveLength(1);
    expect(items()).toHaveLength(1);
  });
});

describe('fix: a removal between opening and the next frame', () => {
  it('still shows the new toast', () => {
    toast('Old');
    nextFrame();
    items()[0]!.querySelector('button')!.click();
    toast('New');
    // the old one goes before the frame of the new one: the region is empty
    fire(items()[0]!, 'transitionend');
    nextFrame();
    expect(showing()).toHaveLength(1);
    expect(isOpen(region())).toBe(true);
  });
});

describe('showFlash', () => {
  const KEY = 'mm-notify.flash';

  beforeEach(() => {
    sessionStorage.clear();
  });

  it('shows the stored message once and removes it', () => {
    sessionStorage.setItem(KEY, '{"text":"Logged out.","kind":"success"}');
    showFlash();
    nextFrame();
    expect(items()).toHaveLength(1);
    expect(items()[0]!.classList).toContain('mm-notify-success');
    expect(items()[0]!.querySelector('p')!.textContent).toBe('Logged out.');
    expect(sessionStorage.getItem(KEY)).toBeNull();
    showFlash();
    nextFrame();
    expect(items()).toHaveLength(1);
  });

  it('reads the configured key', () => {
    configure({ flashKey: 'shop.flash' });
    sessionStorage.setItem('shop.flash', '{"text":"Hi"}');
    sessionStorage.setItem(KEY, '{"text":"Not this"}');
    showFlash();
    nextFrame();
    expect(items()[0]!.querySelector('p')!.textContent).toBe('Hi');
    expect(sessionStorage.getItem(KEY)).not.toBeNull();
  });

  it('does nothing when no message waits', () => {
    showFlash();
    nextFrame();
    expect(region()).toBeNull();
  });

  describe('treats the stored value as untrusted', () => {
    it.each([
      ['not JSON', '{broken'],
      ['null', 'null'],
      ['a number', '5'],
      ['a string', '"text"'],
      ['an array', '["text"]'],
      ['no text', '{"kind":"error"}'],
      ['a text that is no string', '{"text":{"a":1},"kind":"error"}'],
      ['empty text', '{"text":"","kind":"error"}'],
    ])('shows nothing for %s, and does not keep it', (_name, stored) => {
      sessionStorage.setItem(KEY, stored);
      expect(showFlash).not.toThrow();
      nextFrame();
      expect(items()).toHaveLength(0);
      // Kept, every page would load the module again for nothing.
      expect(sessionStorage.getItem(KEY)).toBeNull();
    });

    it.each([
      ['unknown', '"nope"'],
      ['a number', '3'],
      ['missing', 'null'],
      ['an inherited key', '"constructor"'],
      ['another inherited key', '"__proto__"'],
      ['class syntax', '"success evil"'],
    ])('falls back to neutral for a kind that is %s', (_name, kind) => {
      sessionStorage.setItem(KEY, `{"text":"Hi","kind":${kind}}`);
      showFlash();
      nextFrame();
      expect(items()[0]!.className).toBe('mm-notify mm-notify-neutral');
    });

    it('shows markup as text', () => {
      sessionStorage.setItem(KEY, '{"text":"<img src=x onerror=alert(1)>"}');
      showFlash();
      nextFrame();
      expect(document.querySelector('img')).toBeNull();
      expect(items()[0]!.querySelector('p')!.textContent).toContain('<img');
    });
  });

  describe('storage failures', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('does not throw when reading fails', () => {
      vi.stubGlobal('sessionStorage', {
        getItem() {
          throw new DOMException('Denied', 'SecurityError');
        },
      });
      expect(showFlash).not.toThrow();
    });

    it('does not throw when removing fails', () => {
      vi.stubGlobal('sessionStorage', {
        getItem: () => '{"text":"Hi"}',
        removeItem() {
          throw new DOMException('Denied', 'SecurityError');
        },
      });
      expect(showFlash).not.toThrow();
    });
  });
});
