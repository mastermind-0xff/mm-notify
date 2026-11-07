// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentBrowser, isOpen, olderBrowser } from './test-utils/browsers.js';
import type { configure as Configure, ToastKind } from './config.js';
import type {
  flash as Flash,
  showFlash as ShowFlash,
  toast as Toast,
} from './toast.js';

const KINDS: readonly ToastKind[] = ['success', 'error', 'alert', 'neutral'];

let toast: typeof Toast;
let showFlash: typeof ShowFlash;
let flash: typeof Flash;
let configure: typeof Configure;
let undoBrowser: () => void;

/** Fresh modules per test: the region and the settings start from the start. */
async function load(): Promise<void> {
  vi.resetModules();
  ({ toast, flash, showFlash } = await import('./toast.js'));
  ({ configure } = await import('./config.js'));
}

const region = (): HTMLElement =>
  document.querySelector<HTMLElement>('.mm-notify-region')!;

/** Oldest first. The page has them the other way round: the newest at the start. */
const items = (): HTMLElement[] =>
  [...document.querySelectorAll<HTMLElement>('.mm-notify')].reverse();

const showing = (): HTMLElement[] =>
  items().filter((item) => !item.classList.contains('mm-notify-out'));

/** The live region: the messages, without the clear-all button. */
const list = (): HTMLElement =>
  document.querySelector<HTMLElement>('.mm-notify-list')!;

const clearAll = (): HTMLButtonElement =>
  document.querySelector<HTMLButtonElement>('.mm-notify-clear')!;

const clearAllShown = (): boolean =>
  !clearAll().classList.contains('mm-notify-out');

const texts = (): (string | null)[] =>
  showing().map((item) => item.querySelector('p')!.textContent);

const closeButton = (text: string): HTMLButtonElement =>
  showing()
    .find((item) => item.querySelector('p')!.textContent === text)!
    .querySelector('button')!;

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
  ] as const)('closes %s after %d ms', (kind, duration) => {
    toast('Bye', kind);
    nextFrame();
    vi.advanceTimersByTime(duration - 1);
    expect(showing()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(showing()).toHaveLength(0);
  });

  it.each(['alert', 'error'] as const)(
    'keeps %s until closed, by default',
    (kind) => {
      toast('Stay', kind);
      nextFrame();
      vi.advanceTimersByTime(3_600_000);
      expect(showing()).toHaveLength(1);
      items()[0]!.querySelector('button')!.click();
      expect(showing()).toHaveLength(0);
    }
  );

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
    items()[0]!.querySelector('button')!.click();
    vi.advanceTimersByTime(300);
    expect(items()).toHaveLength(1);
    expect(isOpen(region())).toBe(true);
    items()[0]!.querySelector('button')!.click();
    vi.advanceTimersByTime(300);
    expect(items()).toHaveLength(0);
    expect(isOpen(region())).toBe(false);
  });

  it('does not throw where asking for the state it has already throws', () => {
    // The first browsers with popover.
    toast('One');
    nextFrame();
    const toggle = vi
      .spyOn(HTMLElement.prototype, 'togglePopover')
      .mockImplementation(() => {
        throw new DOMException('Already open', 'InvalidStateError');
      });
    expect(() => {
      toast('Two');
      nextFrame();
    }).not.toThrow();
    expect(showing()).toHaveLength(2);
    toggle.mockRestore();
  });

  it('does not throw when a message goes after its region left the page', () => {
    toast('One', 'success', { timeoutMs: 100 });
    nextFrame();
    document.body.replaceChildren();
    expect(() => {
      vi.advanceTimersByTime(400);
    }).not.toThrow();
  });

  it('opens again for a later toast', () => {
    toast('One');
    nextFrame();
    items()[0]!.querySelector('button')!.click();
    vi.advanceTimersByTime(300);
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
    expect(document.querySelectorAll('.mm-notify-list')).toHaveLength(1);
    expect(list().getAttribute('aria-live')).toBe('polite');
    expect(items().every((item) => item.parentElement === list())).toBe(true);
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

describe('toast: the stack', () => {
  const inPage = (): (string | null)[] =>
    [...list().children].map((item) => item.querySelector('p')!.textContent);

  it('puts a new message at the start of the list', () => {
    toast('One');
    nextFrame();
    toast('Two');
    nextFrame();
    toast('Three');
    nextFrame();
    expect(inPage()).toEqual(['Three', 'Two', 'One']);
  });

  it('keeps the order of messages from one frame', () => {
    toast('One');
    toast('Two');
    nextFrame();
    expect(inPage()).toEqual(['Two', 'One']);
  });

  it('tells the CSS how tall a message is, for growing to it', () => {
    const height = vi
      .spyOn(HTMLElement.prototype, 'scrollHeight', 'get')
      .mockReturnValue(42);
    toast('One');
    nextFrame();
    expect(list().firstElementChild!.getAttribute('style') ?? '').toMatch(
      /--mm-notify-height:\s*42px/
    );
    height.mockRestore();
  });

  it('closes the oldest first in sequential mode, wherever it sits', () => {
    configure({ sequential: true });
    toast('One', 'success');
    toast('Two', 'success');
    nextFrame();
    vi.advanceTimersByTime(5000);
    expect(texts()).toEqual(['Two']);
  });
});

describe('toast: the same text twice', () => {
  it('shows both: an action can happen twice', () => {
    toast('Saved', 'success');
    nextFrame();
    const first = items()[0]!;
    toast('Saved', 'success');
    nextFrame();
    expect(first.classList).not.toContain('mm-notify-out');
    expect(texts()).toEqual(['Saved', 'Saved']);
  });

  it('shows both when they come in one frame too', () => {
    toast('Saved', 'success');
    toast('Saved', 'success');
    nextFrame();
    expect(texts()).toEqual(['Saved', 'Saved']);
  });

  it('gives each its own time', () => {
    toast('Saved', 'success');
    nextFrame();
    vi.advanceTimersByTime(1000);
    toast('Saved', 'success');
    nextFrame();
    const second = items()[1]!;
    vi.advanceTimersByTime(4000);
    expect(showing()).toEqual([second]);
    vi.advanceTimersByTime(1000);
    expect(showing()).toHaveLength(0);
  });

  it('closes only the one asked', () => {
    toast('Saved', 'success');
    toast('Saved', 'success');
    nextFrame();
    const second = items()[1]!;
    items()[0]!.querySelector('button')!.click();
    expect(showing()).toEqual([second]);
  });
});

describe('toast: one after the other (sequential)', () => {
  beforeEach(() => {
    configure({ sequential: true });
  });

  it('is off by default: every timer runs at once', async () => {
    await load();
    toast('One', 'success');
    toast('Two', 'success');
    nextFrame();
    vi.advanceTimersByTime(5000);
    expect(showing()).toHaveLength(0);
  });

  it('starts the next timer when the one before closes', () => {
    toast('One', 'success');
    toast('Two', 'success');
    toast('Three', 'success');
    nextFrame();
    vi.advanceTimersByTime(4999);
    expect(texts()).toEqual(['One', 'Two', 'Three']);
    vi.advanceTimersByTime(1);
    expect(texts()).toEqual(['Two', 'Three']);
    vi.advanceTimersByTime(4999);
    expect(texts()).toEqual(['Two', 'Three']);
    vi.advanceTimersByTime(1);
    expect(texts()).toEqual(['Three']);
    vi.advanceTimersByTime(4999);
    expect(texts()).toEqual(['Three']);
    vi.advanceTimersByTime(1);
    expect(texts()).toEqual([]);
  });

  it('gives each message its own time', () => {
    toast('Short', 'success', { timeoutMs: 100 });
    toast('Long', 'success', { timeoutMs: 3000 });
    nextFrame();
    vi.advanceTimersByTime(100);
    expect(texts()).toEqual(['Long']);
    vi.advanceTimersByTime(2999);
    expect(texts()).toEqual(['Long']);
    vi.advanceTimersByTime(1);
    expect(texts()).toEqual([]);
  });

  it('waits for a permanent message before the timers behind it', () => {
    toast('One', 'success');
    toast('Permanent', 'error');
    toast('Three', 'success');
    nextFrame();
    vi.advanceTimersByTime(5000);
    expect(texts()).toEqual(['Permanent', 'Three']);
    vi.advanceTimersByTime(3_600_000);
    expect(texts()).toEqual(['Permanent', 'Three']);
    closeButton('Permanent').click();
    expect(texts()).toEqual(['Three']);
    vi.advanceTimersByTime(4999);
    expect(texts()).toEqual(['Three']);
    vi.advanceTimersByTime(1);
    expect(texts()).toEqual([]);
  });

  it('holds a message that comes later behind a permanent one', () => {
    toast('Permanent', 'alert');
    nextFrame();
    vi.advanceTimersByTime(60_000);
    toast('Later', 'success');
    nextFrame();
    vi.advanceTimersByTime(60_000);
    expect(texts()).toEqual(['Permanent', 'Later']);
    closeButton('Permanent').click();
    vi.advanceTimersByTime(5000);
    expect(texts()).toEqual([]);
  });

  it('runs a timer right away when nothing is ahead of it', () => {
    toast('One', 'success');
    nextFrame();
    vi.advanceTimersByTime(5000);
    toast('Two', 'success');
    nextFrame();
    vi.advanceTimersByTime(5000);
    expect(texts()).toEqual([]);
  });

  it('starts the next when the first is closed by hand', () => {
    toast('One', 'success');
    toast('Two', 'success');
    nextFrame();
    vi.advanceTimersByTime(4000);
    closeButton('One').click();
    vi.advanceTimersByTime(4999);
    expect(texts()).toEqual(['Two']);
    vi.advanceTimersByTime(1);
    expect(texts()).toEqual([]);
  });

  it('leaves the running timer alone when a waiting one is closed', () => {
    toast('One', 'success');
    toast('Two', 'success');
    toast('Three', 'success');
    nextFrame();
    vi.advanceTimersByTime(4000);
    closeButton('Two').click();
    vi.advanceTimersByTime(1000);
    expect(texts()).toEqual(['Three']);
  });

  it('holds the line while the first is hovered', () => {
    toast('One', 'success');
    toast('Two', 'success');
    nextFrame();
    const [first] = items();
    fire(first!, 'pointerenter');
    vi.advanceTimersByTime(60_000);
    expect(texts()).toEqual(['One', 'Two']);
    fire(first!, 'pointerleave');
    vi.advanceTimersByTime(5000);
    expect(texts()).toEqual(['Two']);
  });

  it('does not start a waiting timer when the pointer leaves it', () => {
    toast('One', 'alert');
    toast('Two', 'success');
    nextFrame();
    fire(items()[1]!, 'pointerenter', 'pointerleave');
    vi.advanceTimersByTime(60_000);
    expect(texts()).toEqual(['One', 'Two']);
  });

  it('holds the next if the pointer is on it when its turn comes', () => {
    toast('One', 'success');
    toast('Two', 'success');
    nextFrame();
    const second = items()[1]!;
    fire(second, 'pointerenter');
    vi.advanceTimersByTime(60_000);
    expect(texts()).toEqual(['Two']);
    fire(second, 'pointerleave');
    vi.advanceTimersByTime(5000);
    expect(texts()).toEqual([]);
  });

  it('counts a message from when it is on the page, not before', () => {
    let frame: FrameRequestCallback | undefined;
    toast('One', 'success');
    nextFrame();
    // A hidden tab: frames wait, timers don't.
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frame = callback;
      return 1;
    });
    toast('Two', 'success');
    vi.advanceTimersByTime(60_000);
    expect(texts()).toEqual([]);
    vi.unstubAllGlobals();
    frame?.(0);
    expect(texts()).toEqual(['Two']);
    vi.advanceTimersByTime(4999);
    expect(texts()).toEqual(['Two']);
    vi.advanceTimersByTime(1);
    expect(texts()).toEqual([]);
  });

  it('is not held by a message that left with the page', () => {
    toast('Permanent', 'error');
    nextFrame();
    document.body.replaceChildren();
    toast('Next', 'success');
    nextFrame();
    vi.advanceTimersByTime(5000);
    expect(texts()).toEqual([]);
  });

  it('keeps a message waiting for its frame when the region is rebuilt', () => {
    toast('Waiting', 'success');
    document.body.replaceChildren();
    nextFrame();
    expect(texts()).toEqual(['Waiting']);
    closeButton('Waiting').click();
    expect(texts()).toEqual([]);
  });
});

describe('toast: clear all', () => {
  it('appears from three messages and goes away below that', () => {
    toast('One');
    toast('Two');
    nextFrame();
    expect(clearAllShown()).toBe(false);
    toast('Three');
    nextFrame();
    expect(clearAllShown()).toBe(true);
    closeButton('Three').click();
    expect(clearAllShown()).toBe(false);
  });

  it('closes every message, permanent ones too, and the popover', () => {
    toast('One', 'error');
    toast('Two', 'alert');
    toast('Three', 'success');
    nextFrame();
    clearAll().click();
    expect(showing()).toHaveLength(0);
    expect(clearAllShown()).toBe(false);
    vi.advanceTimersByTime(300);
    expect(items()).toHaveLength(0);
    expect(isOpen(region())).toBe(false);
  });

  it('closes every message in sequential mode too', () => {
    configure({ sequential: true });
    toast('One', 'error');
    toast('Two', 'success');
    toast('Three', 'success');
    nextFrame();
    clearAll().click();
    expect(showing()).toHaveLength(0);
    vi.advanceTimersByTime(60_000);
    expect(items()).toHaveLength(0);
  });

  it('also drops a message still waiting for its frame', () => {
    toast('One');
    toast('Two');
    toast('Three');
    nextFrame();
    toast('Four');
    clearAll().click();
    nextFrame();
    expect(showing()).toHaveLength(0);
    vi.advanceTimersByTime(300);
    expect(items()).toHaveLength(0);
  });

  it('is a labeled button outside the live region, after the messages', () => {
    toast('One');
    nextFrame();
    expect(clearAll().type).toBe('button');
    expect(clearAll().textContent).toBe('Clear all');
    expect(list().contains(clearAll())).toBe(false);
    expect(clearAll().parentElement).toBe(region());
    expect(list().nextElementSibling).toBe(clearAll());
  });

  it('takes the label and the number from configure', () => {
    configure({ clearAllLabel: 'Tout effacer', clearAllFrom: 2 });
    toast('One');
    nextFrame();
    expect(clearAllShown()).toBe(false);
    toast('Two');
    nextFrame();
    expect(clearAllShown()).toBe(true);
    expect(clearAll().textContent).toBe('Tout effacer');
  });

  it('never appears with clearAllFrom: Infinity', () => {
    configure({ clearAllFrom: Infinity });
    for (const text of ['1', '2', '3', '4', '5', '6']) toast(text);
    nextFrame();
    expect(clearAllShown()).toBe(false);
  });

  it('never appears with clearAllFrom: 0, with messages or without', () => {
    configure({ clearAllFrom: 0 });
    toast('One', 'success');
    nextFrame();
    expect(clearAllShown()).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(showing()).toHaveLength(0);
    expect(clearAllShown()).toBe(false);
  });

  it('does not count what left with the page', () => {
    toast('One', 'error');
    toast('Two', 'error');
    nextFrame();
    document.body.replaceChildren();
    toast('Three');
    nextFrame();
    expect(clearAllShown()).toBe(false);
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
    for (const file of ['toast.ts', 'styles.ts', 'has-flash.ts'])
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

  it('is removed after the closing transition, reduced motion or not', () => {
    toast('Hello');
    nextFrame();
    items()[0]!.querySelector('button')!.click();
    vi.advanceTimersByTime(299);
    expect(items()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(items()).toHaveLength(0);
  });

  it('removes it as long after as the CSS transition takes', () => {
    const css = readFileSync(join(import.meta.dirname, 'notify.css'), 'utf8');
    expect(css).toMatch(/transition:\s*0\.3s /);
  });

  it('closes once, however often it is asked', () => {
    toast('Hello', 'neutral', { timeoutMs: 100 });
    nextFrame();
    const item = items()[0]!;
    const spy = vi.spyOn(globalThis, 'setTimeout');
    item.querySelector('button')!.click();
    item.querySelector('button')!.click();
    vi.advanceTimersByTime(100);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
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
    expect(items()[0]!.parentElement).toBe(list());
    expect(region().parentElement).toBe(document.body);
  });

  it('removes the last toast without throwing', () => {
    toast('Hello');
    nextFrame();
    items()[0]!.querySelector('button')!.click();
    expect(() => {
      vi.advanceTimersByTime(300);
    }).not.toThrow();
    expect(items()).toHaveLength(0);
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
describe('fix: a removal between opening and the next frame', () => {
  it('still shows the new toast', () => {
    toast('Old');
    nextFrame();
    items()[0]!.querySelector('button')!.click();
    let frame: FrameRequestCallback | undefined;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frame = callback;
      return 1;
    });
    toast('New');
    // the old one goes before the frame of the new one: the region is empty
    vi.advanceTimersByTime(300);
    expect(items()).toHaveLength(0);
    vi.unstubAllGlobals();
    frame?.(0);
    expect(showing()).toHaveLength(1);
    expect(isOpen(region())).toBe(true);
  });
});

describe('flash', () => {
  const KEY = 'mm-notify.flash';

  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stores text and kind, success by default', () => {
    flash('Logged in.');
    expect(JSON.parse(sessionStorage.getItem(KEY)!)).toEqual({
      text: 'Logged in.',
      kind: 'success',
    });
    flash('Nope', 'error');
    expect(JSON.parse(sessionStorage.getItem(KEY)!)).toEqual({
      text: 'Nope',
      kind: 'error',
    });
  });

  it('takes another key', () => {
    flash('Hi', 'neutral', 'shop.flash');
    expect(sessionStorage.getItem(KEY)).toBeNull();
    expect(sessionStorage.getItem('shop.flash')).not.toBeNull();
  });

  it('shows no message by itself', () => {
    flash('Hi');
    nextFrame();
    expect(region()).toBeNull();
  });

  it('loses the message silently when storage fails', () => {
    vi.stubGlobal('sessionStorage', {
      setItem() {
        throw new DOMException('Full', 'QuotaExceededError');
      },
    });
    expect(() => {
      flash('Hi');
    }).not.toThrow();
  });
});

describe('showFlash', () => {
  const KEY = 'mm-notify.flash';

  beforeEach(() => {
    sessionStorage.clear();
  });

  it('shows what flash left, with its kind', () => {
    flash('Logged out.', 'alert');
    showFlash();
    nextFrame();
    expect(items()[0]!.classList).toContain('mm-notify-alert');
    expect(items()[0]!.querySelector('p')!.textContent).toBe('Logged out.');
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

  it('takes another key', () => {
    sessionStorage.setItem('shop.flash', '{"text":"Hi"}');
    sessionStorage.setItem(KEY, '{"text":"Not this"}');
    showFlash('shop.flash');
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
