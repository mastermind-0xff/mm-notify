/**
 * The notifications: one look for every message, a manual popover so it sits
 * in the top layer over open menus, the CSS with this module. DOM APIs only
 * (sites may enforce Trusted Types).
 */
import { config, type ToastKind } from './config.js';
import { injectStyles } from './styles.js';

export interface ToastOptions {
  /** Read out by screen readers (default). Off when a status line on the page says the same. */
  readonly announce?: boolean;
  /** Milliseconds on screen; 0 keeps it until closed. Default by kind. */
  readonly timeoutMs?: number;
  /** The close button's label. Default: `configure({ closeLabel })`. */
  readonly closeLabel?: string;
}

/** Also in has-flash.ts, which must import nothing. */
const FLASH_KEY = 'mm-notify.flash';
const OUT = 'mm-notify-out';
const SVG = 'http://www.w3.org/2000/svg';

/**
 * The message icons (20 × 20), each in a circle: check, cross, exclamation, info.
 * A dot is a line of no length: its round cap draws it.
 */
const ICONS: Readonly<Record<ToastKind, string>> = {
  success: 'M4.72 7.8 8.83 11.91 17.36 1.17',
  error: 'M4.88 4.88l7.99 7.99M4.88 12.87l7.99-7.99',
  alert: 'M8.87 3.67v6.97M8.87 14.08h0',
  neutral: 'M8.87 14.08V7.11M8.87 3.66h0',
};

function shape(
  tag: string,
  attributes: Readonly<Record<string, string>>
): SVGElement {
  const element = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attributes))
    element.setAttribute(name, value);
  return element;
}

function icon(kind: ToastKind): SVGElement {
  const svg = shape('svg', { viewBox: '-1 -1 20 20', 'aria-hidden': 'true' });
  svg.append(
    shape('circle', { cx: '8.87', cy: '8.87', r: '8.87' }),
    shape('path', { d: ICONS[kind] })
  );
  return svg;
}

function makeButton(className: string, click: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.addEventListener('click', click);
  return button;
}

interface Shown {
  readonly item: HTMLElement;
  /** Starts or stops its timer, for what holds it now. */
  readonly sync: () => void;
  /** Kind and text: what a repeat has in common with it. */
  readonly key: string;
  /**
   * A repeat came, asking for this time: the longer of the two starts over, and when
   * the repeat is announced, so is this one, read out again.
   */
  readonly again: (announce: boolean, ms: number) => void;
}

/** What is on screen or about to be, oldest first. */
let shown: Shown[] = [];
/** The z-index of the newest message in a stack that grows downwards. */
let depth = 0;

let region: HTMLElement | undefined;
/** The live region: only messages, or the button below would be read out as one. */
let list!: HTMLElement;
let clearAll!: HTMLButtonElement;
let watch: ResizeObserver | undefined;

/** A bottom position: `--notify-flow: column-reverse` shows the DOM upside down. */
const reversed = (): boolean =>
  getComputedStyle(list).flexDirection === 'column-reverse';

/**
 * Pins clear all to the far edge of the screen while the stack doesn't fit (CSS
 * `.mm-notify-pinned`). The region spans the screen from where the stack starts to
 * the far edge, laid out from the site's tokens, so its height is the room there
 * is: no `dvh` needed. The flow decides which edge is the far one. The gap: the
 * button's own below it, and as much again above it when pinned at the top.
 */
function fit(): void {
  if (!region) return;
  const up = reversed();
  const gap = parseFloat(getComputedStyle(clearAll).marginBottom);
  region.classList.toggle('mm-notify-up', up);
  region.classList.toggle(
    'mm-notify-pinned',
    list.offsetHeight + clearAll.offsetHeight + gap * (up ? 2 : 1) >
      region.clientHeight
  );
}

function showClearAll(): void {
  clearAll.classList.toggle(
    OUT,
    !config.clearAllFrom || shown.length < config.clearAllFrom
  );
  clearAll.textContent = config.clearAllLabel;
}

/** The region, created once, so screen readers notice what's added to its list later. */
function ownRegion(): void {
  if (region?.isConnected) return;
  injectStyles();
  // Taken out of the page: what was in it is gone, what waits for its frame isn't.
  shown = shown.filter(({ item }) => !item.parentElement);
  region = document.createElement('div');
  region.className = 'mm-notify-region';
  region.setAttribute('popover', 'manual');
  list = document.createElement('div');
  list.className = 'mm-notify-list';
  list.setAttribute('aria-live', 'polite');
  clearAll = makeButton('mm-notify-clear', () => {
    [...shown].forEach(close);
  });
  showClearAll();
  region.append(list, clearAll);
  document.body.append(region);
  // The list's size changes with every message that grows or shrinks, the room
  // with the window (a phone's address bar too). The same listener is added once.
  addEventListener('resize', fit);
  try {
    (watch ??= new ResizeObserver(fit)).observe(list);
  } catch {
    // Too old a browser: the button stays at the end of the stack.
  }
  fit();
}

/**
 * Opens or closes the popover. Older browsers have no popover: the region stays
 * a plain fixed element, which only loses the top layer. The first browsers with
 * one throw when asked for the state it is already in, and all do for a region
 * taken out of the page: nothing to do then either.
 */
function setOpen(open: boolean): void {
  try {
    region?.togglePopover(open);
  } catch {
    // See above.
  }
}

function close(entry: Shown): void {
  const at = shown.indexOf(entry);
  if (at < 0) return;
  shown.splice(at, 1);
  const { item } = entry;
  // A transition starts from the current value. Max-height's is far above the height,
  // and the box wouldn't shrink until it got there; while growing, the browser doesn't
  // transition from the animation's values. So first what the box is now, applied.
  const now = getComputedStyle(item);
  const { zIndex } = item.style;
  item.style.cssText = `animation:none;max-height:${now.height};padding-block:${now.paddingBlock};margin-bottom:${now.marginBottom};opacity:${now.opacity};transform:${now.transform}`;
  item.getBoundingClientRect();
  item.style.cssText = `z-index:${zIndex}`;
  item.classList.add(OUT);
  const remove = (): void => {
    item.remove();
    if (!list.childElementCount) setOpen(false);
  };
  // The CSS transition is 0.3s from the next frame, and reduced motion drops it. A
  // little longer, or a late frame leaves the last pixels to drop at the removal.
  setTimeout(remove, 350);
  showClearAll();
  if (config.sequential && !at) shown[0]?.sync();
}

/**
 * Shows a notification. The same kind and text as one still on screen shows
 * again only with `configure({ repeats: true })`; otherwise that one starts over.
 */
export function toast(
  text: string,
  kind: ToastKind = 'neutral',
  options: ToastOptions = {}
): void {
  if (!text) return;
  ownRegion();
  const key = `${kind} ${text}`;
  const ms = options.timeoutMs ?? config.durations[kind];
  const same = config.repeats ? undefined : shown.find((e) => e.key === key);
  if (same) {
    same.again(options.announce !== false, ms);
    return;
  }

  const item = document.createElement('div');
  item.className = `mm-notify mm-notify-${kind}`;
  if (options.announce === false) item.setAttribute('aria-hidden', 'true');
  else if (kind === 'error') item.setAttribute('role', 'alert');
  const message = document.createElement('p');
  message.textContent = text;
  const button = makeButton('mm-notify-close', () => {
    close(entry);
  });
  button.setAttribute('aria-label', options.closeLabel ?? config.closeLabel);
  item.append(icon(kind), message, button);

  // Counts down only on the page, while neither the pointer nor the focus is on
  // it, and when sequential only as the oldest.
  let duration = ms;
  let holds = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const entry: Shown = {
    item,
    sync() {
      clearTimeout(timer);
      if (
        duration > 0 &&
        !holds &&
        item.isConnected &&
        (!config.sequential || shown[0] === entry)
      )
        timer = setTimeout(() => {
          close(entry);
        }, duration);
    },
    key,
    again(announce, time) {
      // Until closed (0 or less) is the longest: a repeat never shortens a message.
      if (duration > 0 && (time <= 0 || time > duration)) duration = time;
      if (announce) {
        // Shown unannounced before: not hidden any more, or nothing would be read.
        item.removeAttribute('aria-hidden');
        // A text node in its place: a change screen readers read from a live region.
        message.textContent = text;
      }
      entry.sync();
    },
  };
  const hold = (event: string, by: number): void => {
    item.addEventListener(event, () => {
      holds += by;
      entry.sync();
    });
  };
  hold('pointerenter', 1);
  hold('pointerleave', -1);
  hold('focusin', 1);
  hold('focusout', -1);

  shown.push(entry);
  showClearAll();
  setOpen(true);
  // The next frame: an addition to an existing live region is what screen readers announce.
  requestAnimationFrame(() => {
    if (item.classList.contains(OUT)) return; // cleared before its frame
    ownRegion();
    list.prepend(item); // the start of the stack, where `--notify-flow` puts it
    // What it grows to, moving the stack smoothly: CSS can't animate to `auto`.
    item.style.setProperty('--mm-notify-height', `${item.scrollHeight}px`);
    // A glow falls downwards, so the lower message must paint over the upper. Prepending
    // gives that in `column`; `column-reverse` shows the DOM upside down, so it needs this.
    if (reversed()) item.style.zIndex = String(++depth);
    setOpen(true); // an earlier toast's removal may have closed it since
    entry.sync();
  });
}

/**
 * Leaves a notification for the next page (after a redirect or reload). Storage
 * off: the message is lost, nothing else. Here and not in the eager entry because
 * the next page needs this module anyway to show it.
 */
export function flash(
  text: string,
  kind: ToastKind = 'success',
  key = FLASH_KEY
): void {
  try {
    sessionStorage.setItem(key, JSON.stringify({ text, kind }));
  } catch {
    // Lost, on purpose.
  }
}

/** Shows the notification left by `flash` on the previous page, once. */
export function showFlash(key = FLASH_KEY): void {
  let saved: { text?: unknown; kind?: unknown };
  try {
    const stored = sessionStorage.getItem(key);
    // Before parsing: a broken value must not stay and load this module on every page.
    sessionStorage.removeItem(key);
    // `Object`: a stored null, number or string then simply has no text.
    saved = Object(JSON.parse(stored ?? '')) as typeof saved;
  } catch {
    return;
  }
  const { text, kind } = saved;
  if (typeof text === 'string')
    toast(
      text,
      typeof kind === 'string' && Object.hasOwn(config.durations, kind) ?
        (kind as ToastKind)
      : 'neutral'
    );
}
