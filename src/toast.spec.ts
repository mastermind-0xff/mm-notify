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

  it.each([
    ['alert', 8000],
    ['error', 10_000],
  ] as const)(
    'closes %s after %d ms: nothing stays by default',
    (kind, duration) => {
      toast('Bye', kind);
      nextFrame();
      vi.advanceTimersByTime(duration - 1);
      expect(showing()).toHaveLength(1);
      vi.advanceTimersByTime(1);
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
    vi.advanceTimersByTime(350);
    expect(items()).toHaveLength(1);
    expect(isOpen(region())).toBe(true);
    items()[0]!.querySelector('button')!.click();
    vi.advanceTimersByTime(350);
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
    vi.advanceTimersByTime(350);
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

  it('takes a message out of the live region with announce: false, not out of reach', () => {
    for (const kind of KINDS)
      toast(`Said by the status line, ${kind}`, kind, { announce: false });
    nextFrame();
    for (const item of items()) {
      expect(item.getAttribute('aria-live')).toBe('off');
      expect(item.getAttribute('role')).toBeNull();
      // axe aria-hidden-focus: nothing around the close button is hidden.
      expect(item.closest('[aria-hidden]')).toBeNull();
      const button = item.querySelector('button')!;
      expect(button.getAttribute('aria-label')).toBe('Close the message');
      button.focus();
      expect(document.activeElement).toBe(button);
    }
  });

  it('leaves the announced ones in the live region as before, an error as an alert', () => {
    for (const kind of KINDS) toast(`Read out, ${kind}`, kind);
    nextFrame();
    expect(list().getAttribute('aria-live')).toBe('polite');
    for (const item of items()) {
      expect(item.hasAttribute('aria-live')).toBe(false);
      expect(item.getAttribute('role')).toBe(
        item.classList.contains('mm-notify-error') ? 'alert' : null
      );
    }
  });

  it('mixes both in one stack, in the order they came', () => {
    toast('One', 'success');
    toast('Two', 'success', { announce: false });
    toast('Three', 'neutral');
    nextFrame();
    expect(texts()).toEqual(['One', 'Two', 'Three']);
    expect(items().map((item) => item.getAttribute('aria-live'))).toEqual([
      null,
      'off',
      null,
    ]);
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

describe('toast: the same text twice, with repeats', () => {
  beforeEach(() => {
    configure({ repeats: true });
  });

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

describe('toast: the same text twice, by default', () => {
  const textNode = (): Node => items()[0]!.querySelector('p')!.firstChild!;

  it('shows it once', () => {
    toast('Saving failed.', 'error');
    nextFrame();
    toast('Saving failed.', 'error');
    nextFrame();
    expect(texts()).toEqual(['Saving failed.']);
  });

  it('shows it once when both come in one frame too', () => {
    toast('Saved', 'success');
    toast('Saved', 'success');
    nextFrame();
    expect(texts()).toEqual(['Saved']);
    expect(list().childElementCount).toBe(1);
  });

  it('shows the same text of another kind', () => {
    toast('Done', 'success');
    toast('Done', 'neutral');
    nextFrame();
    expect(texts()).toEqual(['Done', 'Done']);
  });

  it('starts the time of the one on screen over, as long as a new one would stay', () => {
    toast('Saved', 'success');
    nextFrame();
    vi.advanceTimersByTime(4000);
    toast('Saved', 'success');
    vi.advanceTimersByTime(4999);
    expect(texts()).toEqual(['Saved']);
    vi.advanceTimersByTime(1);
    expect(texts()).toEqual([]);
  });

  it('keeps one that stays until closed as it is', () => {
    toast('Stay', 'alert', { timeoutMs: 0 });
    nextFrame();
    toast('Stay', 'alert');
    vi.advanceTimersByTime(3_600_000);
    expect(texts()).toEqual(['Stay']);
  });

  it('leaves a held one held', () => {
    toast('Saved', 'success');
    nextFrame();
    fire(items()[0]!, 'pointerenter');
    toast('Saved', 'success');
    vi.advanceTimersByTime(60_000);
    expect(texts()).toEqual(['Saved']);
  });

  it('reads the one on screen out again, unless the repeat is unannounced', () => {
    toast('Saved', 'success');
    nextFrame();
    const before = textNode();
    toast('Saved', 'success', { announce: false });
    expect(textNode()).toBe(before);
    toast('Saved', 'success');
    expect(textNode()).not.toBe(before);
    expect(texts()).toEqual(['Saved']);
  });

  it('reads out one shown unannounced when the repeat is announced', () => {
    toast('Something went wrong.', 'error', { announce: false });
    nextFrame();
    const before = textNode();
    toast('Something went wrong.', 'error', { announce: false });
    // An unannounced repeat of it: still out of the live region, its text untouched.
    expect(items()[0]!.getAttribute('aria-live')).toBe('off');
    expect(items()[0]!.getAttribute('role')).toBeNull();
    expect(textNode()).toBe(before);
    toast('Something went wrong.', 'error');
    expect(items()[0]!.hasAttribute('aria-live')).toBe(false);
    expect(items()[0]!.getAttribute('role')).toBe('alert');
    expect(textNode()).not.toBe(before);
  });

  it('stays until closed when the repeat asks for it', () => {
    toast('Connection lost', 'error');
    nextFrame();
    toast('Connection lost', 'error', { timeoutMs: 0 });
    vi.advanceTimersByTime(3_600_000);
    expect(texts()).toEqual(['Connection lost']);
  });

  it('takes the longer time of the two, never a shorter one', () => {
    toast('Saved', 'success', { timeoutMs: 20_000 });
    nextFrame();
    vi.advanceTimersByTime(1000);
    toast('Saved', 'success');
    vi.advanceTimersByTime(19_999);
    expect(texts()).toEqual(['Saved']);
    toast('Saved', 'success', { timeoutMs: 30_000 });
    vi.advanceTimersByTime(29_999);
    expect(texts()).toEqual(['Saved']);
    vi.advanceTimersByTime(1);
    expect(texts()).toEqual([]);
  });

  it('shows it again once the first is closing', () => {
    toast('Saved', 'success');
    nextFrame();
    closeButton('Saved').click();
    toast('Saved', 'success');
    nextFrame();
    expect(texts()).toEqual(['Saved']);
    expect(items()).toHaveLength(2);
  });

  it('counts for clear all only once', () => {
    toast('One');
    toast('Two');
    toast('Two');
    nextFrame();
    expect(clearAllShown()).toBe(false);
  });

  it('applies to showFlash too, which shows through toast', () => {
    toast('Logged out.', 'success');
    nextFrame();
    flash('Logged out.');
    showFlash();
    nextFrame();
    expect(texts()).toEqual(['Logged out.']);
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
    toast('Permanent', 'error', { timeoutMs: 0 });
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
    toast('Permanent', 'alert', { timeoutMs: 0 });
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
    toast('One', 'alert', { timeoutMs: 0 });
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
    vi.advanceTimersByTime(350);
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
    vi.advanceTimersByTime(350);
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
    vi.advanceTimersByTime(349);
    expect(items()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(items()).toHaveLength(0);
  });

  it('removes it just after the CSS transition, which starts a frame late', () => {
    const css = readFileSync(join(import.meta.dirname, 'notify.css'), 'utf8');
    expect(css).toMatch(/transition:\s*0\.3s /);
  });

  it('starts the closing from what the box is now, applied before the class', () => {
    toast('Hello');
    nextFrame();
    const item = items()[0]!;
    const computed = vi.spyOn(globalThis, 'getComputedStyle').mockReturnValue({
      height: '22px',
      paddingBlock: '13px 12px',
      marginBottom: '9px',
      opacity: '0.5',
      transform: 'none',
    } as CSSStyleDeclaration);
    let applied = '';
    let closing = true;
    vi.spyOn(item, 'getBoundingClientRect').mockImplementation(() => {
      applied = item.style.cssText;
      closing = item.classList.contains('mm-notify-out');
      return new DOMRect();
    });
    item.querySelector('button')!.click();
    computed.mockRestore();
    expect(closing).toBe(false);
    expect(applied).toContain('max-height: 22px');
    expect(applied).toContain('padding-block: 13px 12px');
    expect(applied).toContain('margin-bottom: 9px');
    expect(applied).toContain('opacity: 0.5');
    expect(applied).toContain('animation: none');
    // Nothing inline stays, or it would win over the class.
    expect(item.style.cssText).toBe('');
    expect(item.classList).toContain('mm-notify-out');
  });

  it('paints a lower message over the glow of the upper, when the DOM is upside down', () => {
    toast('First');
    nextFrame();
    list().style.flexDirection = 'column-reverse';
    toast('Second');
    nextFrame();
    toast('Third');
    nextFrame();
    const [first, second, third] = items();
    expect(first!.style.zIndex).toBe('');
    expect(Number(third!.style.zIndex)).toBeGreaterThan(
      Number(second!.style.zIndex)
    );
    expect(Number(second!.style.zIndex)).toBeGreaterThan(0);
    // Also while it closes, or its fading glow would fall on the next.
    const { zIndex } = second!.style;
    closeButton('Second').click();
    expect(second!.style.zIndex).toBe(zIndex);
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

// The user's N27 (2026-11-15): the focus in a closing message fell to the page's start.
describe('toast: the focus after closing', () => {
  /** A button on the page with the focus, then the focus in a message. */
  const start = (): { origin: HTMLButtonElement; cross: HTMLButtonElement } => {
    const origin = document.createElement('button');
    origin.textContent = 'Save';
    document.body.prepend(origin);
    origin.focus();
    const cross = items()[0]!.querySelector('button')!;
    cross.focus();
    return { origin, cross };
  };

  it('goes back where it came from when the cross closes the message', () => {
    toast('Saved.', 'success');
    nextFrame();
    const { origin, cross } = start();
    expect(document.activeElement).toBe(cross);
    cross.click();
    expect(document.activeElement).toBe(origin);
    vi.advanceTimersByTime(350);
    expect(document.activeElement).toBe(origin);
  });

  it('goes back when code closes the message, from its log too', () => {
    const job = toast('Deploying…', 'neutral', { timeoutMs: 0 });
    job.log('Step 1');
    nextFrame();
    const { origin } = start();
    const log = items()[0]!.querySelector<HTMLElement>('.mm-notify-log')!;
    // Within the message: still from the button on the page.
    log.focus();
    expect(document.activeElement).toBe(log);
    job.close();
    expect(document.activeElement).toBe(origin);
  });

  it('stays in the message on replace', () => {
    const job = toast('Deploying…', 'neutral', { timeoutMs: 0 });
    nextFrame();
    const { cross } = start();
    job.replace('Deployed.', 'success');
    expect(document.activeElement).toBe(cross);
  });

  it('moves nothing when the focus is elsewhere', () => {
    const job = toast('Saved.', 'success');
    nextFrame();
    const { cross } = start();
    const other = document.createElement('input');
    document.body.append(other);
    other.focus();
    expect(cross).not.toBe(document.activeElement);
    job.close();
    expect(document.activeElement).toBe(other);
  });

  it('is left as before when where it came from is gone or not focusable', () => {
    const one = toast('One', 'neutral', { timeoutMs: 0 });
    nextFrame();
    const { origin, cross } = start();
    origin.remove();
    one.close();
    expect(document.activeElement).toBe(cross);

    const two = toast('Two', 'neutral', { timeoutMs: 0 });
    nextFrame();
    const next = start();
    next.origin.disabled = true;
    two.close();
    expect(document.activeElement).not.toBe(next.origin);
  });
});

describe('toast: the scrolling stack and its fades', () => {
  // happy-dom lays nothing out: the sizes are set here. It keeps a scrollTop.
  let content = 500;
  let room = 200;
  beforeEach(() => {
    vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockImplementation(
      () => content
    );
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(
      () => room
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
    // Here, not in the tests: a failed one must not leave ResizeObserver stubbed.
    vi.unstubAllGlobals();
    content = 500;
    room = 200;
  });

  const scrollTo = (top: number): void => {
    list().scrollTop = top;
    fire(list(), 'scroll');
  };
  const fades = (): string[] =>
    ['mm-notify-above', 'mm-notify-below'].filter((name) =>
      list().classList.contains(name)
    );

  it('fades only an edge with messages beyond it, as it scrolls', () => {
    toast('One');
    nextFrame();
    scrollTo(0);
    expect(fades()).toEqual(['mm-notify-below']);
    scrollTo(150);
    expect(fades()).toEqual(['mm-notify-above', 'mm-notify-below']);
    scrollTo(300);
    expect(fades()).toEqual(['mm-notify-above']);
    content = 200;
    scrollTo(0);
    expect(fades()).toEqual([]);
  });

  it('knows that a bottom position scrolls from its bottom, upwards below 0', () => {
    toast('One');
    nextFrame();
    list().style.flexDirection = 'column-reverse';
    scrollTo(0);
    expect(fades()).toEqual(['mm-notify-above']);
    scrollTo(-150);
    expect(fades()).toEqual(['mm-notify-above', 'mm-notify-below']);
    scrollTo(-300);
    expect(fades()).toEqual(['mm-notify-below']);
  });

  it('brings a new message into sight at the start of the list', () => {
    toast('One');
    nextFrame();
    list().scrollTop = 150;
    toast('Two');
    expect(list().scrollTop).toBe(150);
    nextFrame();
    expect(list().scrollTop).toBe(0);
  });

  it('keeps the scroll while the keyboard is in the list, so its focus stays in sight', () => {
    toast('One');
    nextFrame();
    closeButton('One').focus();
    list().scrollTop = 150;
    toast('Two');
    nextFrame();
    expect(list().scrollTop).toBe(150);
  });

  it('keeps the scroll while the pointer is on the list, so its message stays under it', () => {
    toast('One');
    nextFrame();
    // happy-dom has no hover.
    vi.spyOn(list(), 'matches').mockImplementation(
      (selector) => selector === ':hover'
    );
    list().scrollTop = 150;
    toast('Two');
    nextFrame();
    expect(list().scrollTop).toBe(150);
  });

  it('watches the list and each message with one ResizeObserver, for the fades', async () => {
    const observed = new Set<Element>();
    const calls: (() => void)[] = [];
    let made = 0;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          made += 1;
          calls.push(callback);
        }
        observe(element: Element): void {
          observed.add(element);
        }
        unobserve(element: Element): void {
          observed.delete(element);
        }
        disconnect(): void {
          observed.clear();
        }
      }
    );
    await load();
    toast('One');
    nextFrame();
    const one = items()[0]!;
    expect([...observed]).toEqual([list(), one]);
    // A message that grows past the room: the observer's call brings the fade.
    calls[0]!();
    expect(fades()).toEqual(['mm-notify-below']);
    closeButton('One').click();
    vi.advanceTimersByTime(350);
    expect([...observed]).toEqual([list()]);
    // A rebuilt region: the old one is let go, the same observer watches the new.
    region().remove();
    toast('Two');
    expect(made).toBe(1);
    expect([...observed]).toEqual([list()]);
  });

  it('does without a ResizeObserver', async () => {
    vi.stubGlobal('ResizeObserver', undefined);
    await load();
    expect(() => {
      toast('One');
      nextFrame();
      closeButton('One').click();
      vi.advanceTimersByTime(350);
    }).not.toThrow();
  });
});

describe('toast: above popovers opened after it', () => {
  const menu = (): HTMLElement => {
    const element = document.createElement('div');
    element.setAttribute('popover', '');
    document.body.append(element);
    return element;
  };
  /** What the region was asked, from the spy on togglePopover. */
  let asked: boolean[] = [];
  /** What the browser does to the region on closing it. */
  let onClose: (() => void) | undefined;
  beforeEach(() => {
    asked = [];
    onClose = undefined;
    // eslint-disable-next-line @typescript-eslint/unbound-method -- called with `this` below
    const toggle = HTMLElement.prototype.togglePopover;
    vi.spyOn(HTMLElement.prototype, 'togglePopover').mockImplementation(
      function (this: HTMLElement, force?: boolean | TogglePopoverOptions) {
        if (this.classList.contains('mm-notify-region')) {
          asked.push(force === true);
          if (force === false) onClose?.();
        }
        return toggle.call(this, force);
      }
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens the region again for a new message, which puts it on top', () => {
    toast('One');
    nextFrame();
    menu().togglePopover(true);
    asked = [];
    toast('Two');
    expect(asked.slice(0, 2)).toEqual([false, true]);
    expect(isOpen(region())).toBe(true);
    nextFrame();
    expect(texts()).toEqual(['One', 'Two']);
  });

  it('does it once: after that the region is above the popover', () => {
    toast('One');
    nextFrame();
    menu().togglePopover(true);
    toast('Two');
    asked = [];
    toast('Three');
    expect(asked).not.toContain(false);
  });

  it('leaves it alone under no later popover, or one opened before it', () => {
    menu().togglePopover(true);
    toast('One');
    nextFrame();
    toast('Two');
    expect(asked).not.toContain(false);
  });

  it('counts only popovers: a dialog has its own top layer rules', () => {
    toast('One');
    nextFrame();
    const dialog = document.createElement('dialog');
    document.body.append(dialog);
    dialog.dispatchEvent(
      Object.assign(new Event('beforetoggle'), { newState: 'open' })
    );
    toast('Two');
    expect(asked).not.toContain(false);
  });

  it('raises for a repeat too, which starts a message on screen over', () => {
    toast('One');
    nextFrame();
    menu().togglePopover(true);
    asked = [];
    toast('One');
    expect(asked.slice(0, 2)).toEqual([false, true]);
  });

  it('gives back the focus and the scroll a browser may take on closing', () => {
    toast('One');
    nextFrame();
    const cross = closeButton('One');
    cross.focus();
    list().scrollTop = 120;
    menu().togglePopover(true);
    // A browser that moves the focus out of a closing popover and resets the scroll.
    onClose = () => {
      cross.blur();
      list().scrollTop = 0;
    };
    const focus = vi.spyOn(cross, 'focus');
    toast('Two');
    expect(document.activeElement).toBe(cross);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(list().scrollTop).toBe(120);
  });

  it('leaves an unannounced message out of the live region, and its text alone', () => {
    toast('Quiet', 'success', { announce: false });
    nextFrame();
    const textNode = (): Node | null =>
      items()[0]!.querySelector('p')!.firstChild;
    const before = textNode();
    menu().togglePopover(true);
    asked = [];
    toast('Two');
    expect(asked.slice(0, 2)).toEqual([false, true]);
    const quiet = items()[0]!;
    expect(quiet.getAttribute('aria-live')).toBe('off');
    expect(textNode()).toBe(before);
  });

  it('moves no focus that stayed', () => {
    toast('One');
    nextFrame();
    const cross = closeButton('One');
    cross.focus();
    menu().togglePopover(true);
    const focus = vi.spyOn(cross, 'focus');
    toast('Two');
    expect(focus).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(cross);
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
      vi.advanceTimersByTime(350);
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
    vi.advanceTimersByTime(350);
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

// The answer to aesweets D49 (2026-11-14): "It should be possible to update the notification."
describe('the handle toast returns', () => {
  it('has the methods and is open while the message is up', () => {
    const job = toast('Saving…');
    expect(job.closed).toBe(false);
    expect(job.update('Still saving…')).toBe(job);
    expect(job.replace('Saving again…')).toBe(job);
    expect(job.progress(0.5)).toBe(job);
    expect(job.log('A line')).toBe(job);
    expect(job.whenClosed).toBeInstanceOf(Promise);
  });

  it('is closed from the start for an empty text, and does nothing', async () => {
    const job = toast('');
    expect(job.closed).toBe(true);
    await expect(job.whenClosed).resolves.toBeUndefined();
    job.update('Hello', 'error').replace('Hi').progress(0.5).log('Line');
    job.close();
    nextFrame();
    expect(region()).toBeNull();
  });

  it('is the one on screen for a repeat that shows no message of its own', () => {
    const first = toast('Saving…');
    nextFrame();
    expect(toast('Saving…')).toBe(first);
    expect(texts()).toEqual(['Saving…']);
  });

  it('is its own for every message with repeats', () => {
    configure({ repeats: true });
    const first = toast('Saving…');
    expect(toast('Saving…')).not.toBe(first);
  });

  // The user's N23 (2026-11-15): work in progress is never shared with other work.
  it('is a new message for the same text as one with a progress bar', () => {
    const first = toast('Saving…').progress(true);
    nextFrame();
    const second = toast('Saving…');
    expect(second).not.toBe(first);
    nextFrame();
    expect(texts()).toEqual(['Saving…', 'Saving…']);
    // Each job's outcome reaches its own message.
    first.replace('Saved.', 'success');
    second.replace('Saving failed.', 'error');
    expect(texts()).toEqual(['Saved.', 'Saving failed.']);
  });

  it('is a new message before the barred one is on screen too', () => {
    const first = toast('Saving…').progress(0.2);
    expect(toast('Saving…')).not.toBe(first);
    nextFrame();
    expect(showing()).toHaveLength(2);
  });

  it('is the one on screen again once its bar is gone', () => {
    const job = toast('Saving…').progress(true);
    nextFrame();
    job.progress(false);
    expect(toast('Saving…')).toBe(job);
    expect(showing()).toHaveLength(1);
  });

  it('still shares equal messages without a bar, beside a barred one', () => {
    const barred = toast('Saving…').progress(true);
    const plain = toast('Saving…');
    nextFrame();
    expect(toast('Saving…')).toBe(plain);
    expect(toast('Saving…')).not.toBe(barred);
    nextFrame();
    expect(showing()).toHaveLength(2);
  });
});

describe('handle.update', () => {
  const pathOf = (item: HTMLElement): string | null =>
    item.querySelector('path')!.getAttribute('d');

  it('changes the words in place, keeping the kind', () => {
    const job = toast('Saving…', 'neutral', { timeoutMs: 0 });
    nextFrame();
    const item = items()[0]!;
    job.update('Saving 2 of 3…');
    expect(items()).toEqual([item]);
    expect(texts()).toEqual(['Saving 2 of 3…']);
    expect(item.className).toBe('mm-notify mm-notify-neutral');
  });

  it('changes the kind: class, icon and role', () => {
    const icons = Object.fromEntries(
      KINDS.map((kind) => {
        toast(`Icon ${kind}`, kind);
        nextFrame();
        return [kind, pathOf(showing().at(-1)!)];
      })
    );
    const job = toast('Saving…', 'neutral', { timeoutMs: 0 });
    nextFrame();
    const item = showing().at(-1)!;
    job.update('Saving failed.', 'error');
    expect(item.className).toBe('mm-notify mm-notify-error');
    expect(pathOf(item)).toBe(icons['error']);
    expect(item.getAttribute('role')).toBe('alert');
    job.update('Saved after all.', 'success');
    expect(item.className).toBe('mm-notify mm-notify-success');
    expect(pathOf(item)).toBe(icons['success']);
    expect(item.hasAttribute('role')).toBe(false);
  });

  it('keeps the words for an empty text', () => {
    const job = toast('Taking long', 'neutral');
    nextFrame();
    job.update('', 'alert');
    expect(texts()).toEqual(['Taking long']);
    expect(items()[0]!.classList).toContain('mm-notify-alert');
  });

  it('keeps the progress bar and the log', () => {
    const job = toast('Uploading…').progress(0.2).log('a.txt');
    nextFrame();
    job.update('Uploading 2 of 5…', 'alert');
    const item = items()[0]!;
    expect(item.querySelector('.mm-notify-bar')).not.toBeNull();
    expect(item.querySelector('.mm-notify-log')!.textContent).toBe('a.txt');
  });

  it('starts the same time over when the kind stays', () => {
    const job = toast('Saved', 'success');
    nextFrame();
    vi.advanceTimersByTime(4000);
    job.update('Saved twice');
    vi.advanceTimersByTime(4999);
    expect(texts()).toEqual(['Saved twice']);
    vi.advanceTimersByTime(1);
    expect(texts()).toEqual([]);
  });

  it('keeps a message that stays until closed so, when the kind stays', () => {
    const job = toast('Working…', 'neutral', { timeoutMs: 0 });
    nextFrame();
    job.update('Still working…');
    vi.advanceTimersByTime(3_600_000);
    expect(texts()).toEqual(['Still working…']);
  });

  it('takes the default time of a new kind, as toast would', () => {
    const job = toast('Saving…', 'neutral', { timeoutMs: 0 });
    nextFrame();
    job.update('Saved.', 'success');
    vi.advanceTimersByTime(4999);
    expect(texts()).toEqual(['Saved.']);
    vi.advanceTimersByTime(1);
    expect(texts()).toEqual([]);
  });

  it('takes timeoutMs over both', () => {
    const job = toast('Saving…', 'neutral');
    nextFrame();
    job.update('Saved.', 'success', { timeoutMs: 0 });
    vi.advanceTimersByTime(3_600_000);
    expect(texts()).toEqual(['Saved.']);
    job.update('Saved.', 'success', { timeoutMs: 100 });
    vi.advanceTimersByTime(100);
    expect(texts()).toEqual([]);
  });

  it('is silent for new words of the same kind, unless asked', () => {
    const job = toast('Uploading…', 'neutral');
    nextFrame();
    const item = items()[0]!;
    const node = item.querySelector('p')!.firstChild;
    job.update('Uploading 2 of 5…');
    expect(item.getAttribute('aria-live')).toBe('off');
    job.update('Uploading 3 of 5…', 'neutral', { announce: true });
    expect(item.hasAttribute('aria-live')).toBe(false);
    // A new text node: what a live region reads.
    expect(item.querySelector('p')!.firstChild).not.toBe(node);
  });

  it('keeps the voice it came with before its frame: an announced message arrives announced', () => {
    // Review 2026-11-14: the first update often comes before the frame (a fast first
    // answer, a tab in the background, where frames wait), and silenced the message.
    const job = toast('Exporting…').update('Exporting 1 of 12…');
    toast('Still saving…', 'neutral', { announce: false }).update(
      'Still saving, 2 of 3…'
    );
    toast('Uploading…').update('Uploading 2 of 5…', 'neutral', {
      announce: false,
    });
    nextFrame();
    const [loud, quiet, asked] = items();
    expect(loud!.hasAttribute('aria-live')).toBe(false);
    expect(loud!.textContent).toBe('Exporting 1 of 12…');
    expect(quiet!.getAttribute('aria-live')).toBe('off');
    expect(asked!.getAttribute('aria-live')).toBe('off');
    // On the page, new words of the same kind are silent again.
    job.update('Exporting 2 of 12…');
    expect(loud!.getAttribute('aria-live')).toBe('off');
  });

  it('is read out when the kind changes, unless told not to', () => {
    const job = toast('Saving…', 'neutral', { announce: false });
    nextFrame();
    const item = items()[0]!;
    expect(item.getAttribute('aria-live')).toBe('off');
    job.update('Saving failed.', 'error', { announce: false });
    expect(item.getAttribute('aria-live')).toBe('off');
    expect(item.hasAttribute('role')).toBe(false);
    job.update('Saved.', 'success');
    expect(item.hasAttribute('aria-live')).toBe(false);
  });

  it('merges with no other message: both show, a later repeat goes to the oldest', () => {
    const done = toast('Saved.', 'success');
    const job = toast('Saving…', 'neutral');
    nextFrame();
    job.update('Saved.', 'success');
    expect(texts()).toEqual(['Saved.', 'Saved.']);
    expect(toast('Saved.', 'success')).toBe(done);
    expect(showing()).toHaveLength(2);
  });

  it('is what a repeat compares: the words and kind it has now', () => {
    const job = toast('Saving…', 'neutral');
    nextFrame();
    job.update('Saved.', 'success');
    expect(toast('Saved.', 'success')).toBe(job);
    expect(toast('Saving…', 'neutral')).not.toBe(job);
    nextFrame();
    expect(texts()).toEqual(['Saved.', 'Saving…']);
  });

  it('keeps the close label, unless given another', () => {
    const job = toast('Hi', 'neutral', { closeLabel: 'Dismiss' });
    nextFrame();
    const button = items()[0]!.querySelector('button')!;
    job.update('Hello');
    expect(button.getAttribute('aria-label')).toBe('Dismiss');
    job.update('Hey', 'neutral', { closeLabel: 'Fermer' });
    expect(button.getAttribute('aria-label')).toBe('Fermer');
  });

  it('works before the frame, which shows the new words', () => {
    toast('First', 'neutral').update('Second', 'success');
    nextFrame();
    expect(texts()).toEqual(['Second']);
    expect(items()[0]!.classList).toContain('mm-notify-success');
  });

  it('tells a message still growing the height it grows to now', () => {
    const job = toast('One line');
    nextFrame();
    const item = items()[0]!;
    vi.spyOn(item, 'scrollHeight', 'get').mockReturnValue(120);
    job.log('A line that makes it taller');
    expect(item.style.getPropertyValue('--mm-notify-height')).toBe('120px');
    vi.restoreAllMocks();
  });
});

describe('handle.replace', () => {
  it('changes everything: words, kind, no bar, no log, read out', () => {
    const job = toast('Uploading…', 'neutral', { announce: false })
      .progress(0.5)
      .log('a.txt');
    nextFrame();
    job.replace('Uploaded.', 'success');
    const item = items()[0]!;
    expect(texts()).toEqual(['Uploaded.']);
    expect(item.className).toBe('mm-notify mm-notify-success');
    expect(item.querySelector('.mm-notify-bar, .mm-notify-log')).toBeNull();
    expect(item.hasAttribute('aria-live')).toBe(false);
  });

  it('keeps the kind when not given, and takes its default time', () => {
    const job = toast('Working…', 'alert', { timeoutMs: 0 });
    nextFrame();
    job.replace('Done, with warnings.');
    expect(items()[0]!.classList).toContain('mm-notify-alert');
    vi.advanceTimersByTime(7999);
    expect(texts()).toEqual(['Done, with warnings.']);
    vi.advanceTimersByTime(1);
    expect(texts()).toEqual([]);
  });

  it('takes timeoutMs and announce: false, as toast does', () => {
    const job = toast('Working…', 'neutral');
    nextFrame();
    job.replace('Failed.', 'error', { timeoutMs: 0, announce: false });
    const item = items()[0]!;
    expect(item.getAttribute('aria-live')).toBe('off');
    expect(item.hasAttribute('role')).toBe(false);
    vi.advanceTimersByTime(3_600_000);
    expect(texts()).toEqual(['Failed.']);
  });
});

describe('handle.progress', () => {
  const bar = (): HTMLElement | null =>
    items()[0]!.querySelector('.mm-notify-bar');

  it('shows a progress bar with its value, named by the text', () => {
    toast('Uploading…').progress(0.4);
    nextFrame();
    expect(bar()!.getAttribute('role')).toBe('progressbar');
    expect(bar()!.getAttribute('aria-valuenow')).toBe('40');
    expect(bar()!.style.getPropertyValue('--mm-notify-value')).toBe('0.4');
    const name = document.getElementById(
      bar()!.getAttribute('aria-labelledby')!
    );
    expect(name).toBe(items()[0]!.querySelector('p'));
    // Nothing to read out when it is added: no text of its own.
    expect(bar()!.textContent).toBe('');
  });

  it('keeps the value between 0 and 1', () => {
    const job = toast('Uploading…');
    nextFrame();
    const values = [-1, 2, Number.NaN, 0.123].map((value) => {
      job.progress(value);
      return bar()!.getAttribute('aria-valuenow');
    });
    expect(values).toEqual(['0', '100', '0', '12']);
  });

  it('has no value while the amount is unknown, and one bar however often asked', () => {
    const job = toast('Waiting for the bank…').progress(true);
    nextFrame();
    expect(bar()!.hasAttribute('aria-valuenow')).toBe(false);
    job.progress(0.7).progress(true);
    expect(items()[0]!.querySelectorAll('.mm-notify-bar')).toHaveLength(1);
    expect(bar()!.hasAttribute('aria-valuenow')).toBe(false);
  });

  it('takes a text for the value, for screen readers', () => {
    const job = toast('Uploading…').progress(0.3, '3 of 10 files');
    nextFrame();
    expect(bar()!.getAttribute('aria-valuetext')).toBe('3 of 10 files');
    job.progress(0.4);
    expect(bar()!.hasAttribute('aria-valuetext')).toBe(false);
  });

  it('goes with false', () => {
    const job = toast('Uploading…').progress(0.4);
    nextFrame();
    job.progress(false);
    expect(bar()).toBeNull();
  });

  it('holds the time while it shows, and starts it over in full when it goes', () => {
    const job = toast('Uploading…', 'success').progress(true);
    nextFrame();
    vi.advanceTimersByTime(3_600_000);
    expect(texts()).toEqual(['Uploading…']);
    job.progress(false);
    vi.advanceTimersByTime(4999);
    expect(texts()).toEqual(['Uploading…']);
    vi.advanceTimersByTime(1);
    expect(texts()).toEqual([]);
  });

  it('sits under the text, above a log', () => {
    toast('Building…').log('step 1').progress(0.1);
    nextFrame();
    expect(
      [...items()[0]!.children].map((child) => child.tagName.toLowerCase())
    ).toEqual(['svg', 'p', 'button', 'div', 'div']);
    expect(items()[0]!.children[3]!.className).toBe('mm-notify-bar');
  });

  it('names each bar by its own message', () => {
    toast('One').progress(0.1);
    toast('Two').progress(0.2);
    nextFrame();
    const names = items().map((item) =>
      item.querySelector('.mm-notify-bar')!.getAttribute('aria-labelledby')
    );
    expect(new Set(names).size).toBe(2);
  });

  it('holds those behind it in sequential mode, like a message that stays', () => {
    configure({ sequential: true });
    const job = toast('Uploading…', 'neutral').progress(true);
    toast('Saved.', 'success');
    nextFrame();
    vi.advanceTimersByTime(60_000);
    expect(texts()).toEqual(['Uploading…', 'Saved.']);
    job.replace('Uploaded.', 'success');
    vi.advanceTimersByTime(5000);
    expect(texts()).toEqual(['Saved.']);
    vi.advanceTimersByTime(5000);
    expect(texts()).toEqual([]);
  });
});

describe('handle.log', () => {
  const log = (): HTMLElement => items()[0]!.querySelector('.mm-notify-log')!;
  const rows = (): (string | null)[] =>
    [...log().children].map((row) => row.textContent);

  it('adds lines, newest last, as plain text', () => {
    toast('Deploying…', 'neutral', { timeoutMs: 0 })
      .log('Building')
      .log('<img src=x>');
    nextFrame();
    expect(rows()).toEqual(['Building', '<img src=x>']);
    expect(log().querySelector('img')).toBeNull();
  });

  it('hands its focus to the cross when replace takes it away, and the hold with it', () => {
    const job = toast('Deploying…', 'success').log('Building');
    nextFrame();
    log().focus();
    job.replace('Deployed.', 'success');
    const cross = items()[0]!.querySelector('button')!;
    expect(document.activeElement).toBe(cross);
    vi.advanceTimersByTime(60_000);
    expect(texts()).toEqual(['Deployed.']);
    cross.blur();
    vi.advanceTimersByTime(5000);
    expect(texts()).toEqual([]);
  });

  it('is a log that is not read out, and a keyboard can scroll it', () => {
    toast('Deploying…').log('Building');
    nextFrame();
    expect(log().getAttribute('role')).toBe('log');
    expect(log().getAttribute('aria-live')).toBe('off');
    expect(log().tabIndex).toBe(0);
  });

  it('keeps the last lines only', () => {
    configure({ logLines: 3 });
    const job = toast('Deploying…');
    for (let line = 1; line <= 5; line += 1) job.log(`Line ${String(line)}`);
    nextFrame();
    expect(rows()).toEqual(['Line 3', 'Line 4', 'Line 5']);
  });

  it.each([0, -1])(
    'keeps the newest line with logLines %d: never an empty log, never a hang',
    (logLines) => {
      // Review 2026-11-14: 0 emptied the log, below 0 the trimming never stopped.
      configure({ logLines });
      toast('Deploying…').log('Line 1').log('Line 2');
      nextFrame();
      expect(rows()).toEqual(['Line 2']);
    }
  );

  it('keeps 100 lines by default', () => {
    const job = toast('Deploying…');
    for (let line = 1; line <= 150; line += 1) job.log(`Line ${String(line)}`);
    nextFrame();
    expect(rows()).toHaveLength(100);
    expect(rows()[0]).toBe('Line 51');
  });

  it('stays at its end for the newest line, unless the reader scrolled up', () => {
    // Each line 20 px in a box 50 px tall.
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(50);
    vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockImplementation(
      function (this: Element) {
        return 20 * this.childElementCount;
      }
    );
    const job = toast('Deploying…').log('1').log('2').log('3');
    nextFrame();
    log().scrollTop = 10; // at the end
    job.log('4');
    expect(log().scrollTop).toBe(80);
    log().scrollTop = 5; // the reader went up
    job.log('5');
    expect(log().scrollTop).toBe(5);
    vi.restoreAllMocks();
  });

  it('shows the newest of the lines logged before its frame', () => {
    vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockReturnValue(300);
    toast('Deploying…').log('1').log('2').log('3');
    nextFrame();
    expect(log().scrollTop).toBe(300);
    vi.restoreAllMocks();
  });

  it('starts the time over with every line', () => {
    const job = toast('Deploying…', 'success');
    nextFrame();
    vi.advanceTimersByTime(4000);
    job.log('Still going');
    vi.advanceTimersByTime(4999);
    expect(texts()).toEqual(['Deploying…']);
    vi.advanceTimersByTime(1);
    expect(texts()).toEqual([]);
  });
});

describe('handle.close, closed and whenClosed', () => {
  it('closes as the cross does', async () => {
    const job = toast('Working…', 'neutral', { timeoutMs: 0 });
    nextFrame();
    job.close();
    expect(items()[0]!.classList).toContain('mm-notify-out');
    expect(job.closed).toBe(true);
    await expect(job.whenClosed).resolves.toBeUndefined();
    vi.advanceTimersByTime(350);
    expect(items()).toEqual([]);
    expect(isOpen(region())).toBe(false);
  });

  it.each([
    [
      'its cross',
      () => {
        closeButton('Working…').click();
      },
    ],
    [
      'Clear all',
      () => {
        clearAll().click();
      },
    ],
    [
      'its time',
      () => {
        vi.advanceTimersByTime(5000);
      },
    ],
  ])('knows it closed by %s', async (_, how) => {
    configure({ clearAllFrom: 1 });
    const job = toast('Working…');
    nextFrame();
    let told = false;
    void job.whenClosed.then(() => {
      told = true;
    });
    how();
    await Promise.resolve();
    expect(job.closed).toBe(true);
    expect(told).toBe(true);
  });

  it('does nothing once closed: no update, no bar, no line, no coming back', () => {
    const job = toast('Working…', 'neutral', { timeoutMs: 0 });
    nextFrame();
    closeButton('Working…').click();
    const item = items()[0]!;
    const before = item.outerHTML;
    expect(() => {
      job.update('Done.', 'success').replace('Done!').progress(1).log('Line');
      job.close();
    }).not.toThrow();
    expect(item.outerHTML).toBe(before);
    vi.advanceTimersByTime(350);
    expect(items()).toEqual([]);
  });

  it('is no repeat target once closed: the same text shows again', () => {
    const job = toast('Saved.', 'success');
    nextFrame();
    job.close();
    expect(toast('Saved.', 'success')).not.toBe(job);
    nextFrame();
    expect(texts()).toEqual(['Saved.']);
  });

  it('never shows when closed before its frame', async () => {
    const job = toast('Quick');
    job.close();
    nextFrame();
    expect(items()).toEqual([]);
    await expect(job.whenClosed).resolves.toBeUndefined();
  });

  it('is closed when its region left the page', async () => {
    const job = toast('Gone with the page', 'neutral', { timeoutMs: 0 });
    nextFrame();
    region().remove();
    toast('A new page');
    expect(job.closed).toBe(true);
    await expect(job.whenClosed).resolves.toBeUndefined();
  });
});
