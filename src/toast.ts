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

const OUT = 'mm-notify-out';
const SVG = 'http://www.w3.org/2000/svg';

/** A dot, as the alert and neutral icons have one. */
const dot = (cy: string): readonly [string, Record<string, string>] => [
  'circle',
  { cx: '8.87', cy, r: '0.75', fill: 'currentColor', stroke: 'none' },
];

/** The message icons (20 × 20): check, cross, exclamation, info, each in a circle. */
const ICONS: Readonly<
  Record<ToastKind, readonly (readonly [string, Record<string, string>])[]>
> = {
  success: [['polyline', { points: '4.72 7.8 8.83 11.91 17.36 1.17' }]],
  error: [['path', { d: 'M4.88 4.88l7.99 7.99M4.88 12.87l7.99-7.99' }]],
  alert: [['path', { d: 'M8.87 3.67v6.97' }], dot('14.08')],
  neutral: [['path', { d: 'M8.87 14.08V7.11' }], dot('3.66')],
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
  svg.append(shape('circle', { cx: '8.87', cy: '8.87', r: '8.87' }));
  for (const [tag, attributes] of ICONS[kind])
    svg.append(shape(tag, attributes));
  return svg;
}

let region: HTMLElement | undefined;

/** What is on screen or about to be, by text: the same text replaces it. */
const current = new Map<string, HTMLElement>();

/** The live region (created once, so screen readers notice what's added to it later). */
function liveRegion(): HTMLElement {
  if (region?.isConnected) return region;
  injectStyles();
  region = document.createElement('div');
  region.className = 'mm-notify-region';
  region.setAttribute('popover', 'manual');
  region.setAttribute('aria-live', 'polite');
  document.body.append(region);
  return region;
}

/**
 * Opens or closes the popover. Older browsers have no popover (the selector
 * alone is a SyntaxError there): the region stays a plain fixed element, which
 * only loses the top layer.
 */
function setOpen(box: HTMLElement, open: boolean): void {
  if (!('showPopover' in box) || box.matches(':popover-open') === open) return;
  if (open) box.showPopover();
  else box.hidePopover();
}

function close(item: HTMLElement, text: string): void {
  if (item.classList.contains(OUT)) return;
  item.classList.add(OUT);
  current.delete(text);
  const remove = (): void => {
    item.remove();
    if (region?.childElementCount === 0) setOpen(region, false);
  };
  item.addEventListener('transitionend', remove, { once: true });
  setTimeout(remove, 400); // reduced motion: no transition, no event
}

/** Shows a notification; the same text twice in a row restarts the first one instead. */
export function toast(
  text: string,
  kind: ToastKind = 'neutral',
  options: ToastOptions = {}
): void {
  if (text === '') return;
  const earlier = current.get(text);
  if (earlier) close(earlier, text);

  const item = document.createElement('div');
  item.className = `mm-notify mm-notify-${kind}`;
  if (options.announce === false) item.setAttribute('aria-hidden', 'true');
  else if (kind === 'error') item.setAttribute('role', 'alert');
  const message = document.createElement('p');
  message.textContent = text;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'mm-notify-close';
  button.setAttribute('aria-label', options.closeLabel ?? config.closeLabel);
  button.addEventListener('click', () => {
    close(item, text);
  });
  item.append(icon(kind), message, button);
  current.set(text, item);

  // Counts down only while neither the pointer nor the focus is on it.
  const duration = options.timeoutMs ?? config.durations[kind];
  let hovered = false;
  let focused = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const sync = (): void => {
    clearTimeout(timer);
    if (duration > 0 && !hovered && !focused)
      timer = setTimeout(() => {
        close(item, text);
      }, duration);
  };
  const on = (event: string, change: () => void): void => {
    item.addEventListener(event, () => {
      change();
      sync();
    });
  };
  on('pointerenter', () => (hovered = true));
  on('pointerleave', () => (hovered = false));
  on('focusin', () => (focused = true));
  on('focusout', () => (focused = false));

  setOpen(liveRegion(), true);
  // The next frame: an addition to an existing live region is what screen readers announce.
  requestAnimationFrame(() => {
    if (item.classList.contains(OUT)) return; // replaced in this same frame
    const box = liveRegion();
    box.append(item);
    setOpen(box, true); // an earlier toast's removal may have closed it since
    sync();
  });
}

/** Shows the notification left by `flash` on the previous page, once. */
export function showFlash(): void {
  let saved: unknown;
  try {
    const stored = sessionStorage.getItem(config.flashKey);
    // Before parsing: a broken value must not stay and load this module on every page.
    sessionStorage.removeItem(config.flashKey);
    saved = JSON.parse(stored ?? 'null');
  } catch {
    return;
  }
  if (typeof saved !== 'object' || saved === null) return;
  const { text, kind } = saved as { text?: unknown; kind?: unknown };
  if (typeof text !== 'string') return;
  toast(
    text,
    typeof kind === 'string' && Object.hasOwn(config.durations, kind) ?
      (kind as ToastKind)
    : 'neutral'
  );
}
