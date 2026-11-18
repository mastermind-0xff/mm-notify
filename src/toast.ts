/**
 * The notifications: one look for every message, a manual popover so it sits
 * in the top layer over open menus, the CSS with this module. DOM APIs only
 * (sites may enforce Trusted Types).
 */
import { config, type ToastKind } from './config.js';
import { injectStyles } from './styles.js';

export interface ToastOptions {
  /**
   * Read out by screen readers when it appears (default). Off when a status line
   * on the page says the same: the message is still there for them, with its close
   * button, only not announced.
   */
  readonly announce?: boolean;
  /** Milliseconds on screen; 0 keeps it until closed. Default by kind. */
  readonly timeoutMs?: number;
  /** The close button's label. Default: `configure({ closeLabel })`. */
  readonly closeLabel?: string;
}

/**
 * The message `toast()` showed, to change while it is on screen: work in the
 * background, its progress, its outcome. Once the message is closed (by its cross,
 * its time, Clear all or `close()`), every method does nothing: a message someone
 * closed doesn't come back. Each method but `close` returns the handle, to chain.
 */
export interface ToastHandle {
  /**
   * New words, and a new kind if given; the progress bar and the log stay. The
   * time starts over: the same, unless `timeoutMs` or a new kind (then its default)
   * says otherwise. Read out when the kind changes or with `announce: true`; new
   * words of the same kind are silent by default. An empty text keeps the words.
   */
  update(text: string, kind?: ToastKind, options?: ToastOptions): ToastHandle;
  /**
   * New contents altogether, as `toast(text, kind, options)` would show them, in
   * place: no progress bar, no log, the kind's time (or `timeoutMs`), read out
   * unless `announce: false`. The kind stays when not given.
   */
  replace(text: string, kind?: ToastKind, options?: ToastOptions): ToastHandle;
  /**
   * A progress bar under the text: a number from 0 to 1, `true` while the amount
   * is unknown, `false` to remove it. While it shows, the message's time doesn't
   * run: it waits for the outcome. `text` is what screen readers say for the
   * value (`aria-valuetext`), "3 of 10 files"; by default the percentage.
   */
  progress(value: number | boolean, text?: string): ToastHandle;
  /**
   * Adds a line to a log under the text, console-like: the newest at the bottom,
   * in sight unless the reader scrolled up, at most `configure({ logLines })`
   * kept. Not read out. The time starts over.
   */
  log(line: string): ToastHandle;
  /**
   * Closes the message, as its cross does. A focus in it goes back to where it came
   * into the notifications from, if that is still on the page.
   */
  close(): void;
  /** Whether the message is closed (or never showed: an empty text). */
  readonly closed: boolean;
  /** Fulfilled when the message closes, for whatever reason. */
  readonly whenClosed: Promise<void>;
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

/** An element with these attributes: SVG, or HTML when asked. */
function shape(
  tag: string,
  attributes: Readonly<Record<string, string>>
): SVGElement;
function shape(
  tag: string,
  attributes: Readonly<Record<string, string>>,
  html: true
): HTMLElement;
function shape(
  tag: string,
  attributes: Readonly<Record<string, string>>,
  html?: true
): Element {
  const element =
    html ? document.createElement(tag) : document.createElementNS(SVG, tag);
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

function makeButton(className: string, click: () => void): HTMLElement {
  const button = shape('button', { type: 'button', class: className }, true);
  button.addEventListener('click', click);
  return button;
}

/** A message: its handle, with what the package needs (not part of the API). */
interface Shown extends ToastHandle {
  readonly item: HTMLElement;
  /** Starts or stops its timer, for what holds it now. */
  readonly sync: () => void;
  /** Kind and text, as they are now: what a repeat has in common with it. */
  key: string;
  /**
   * A repeat came, asking for this time: the longer of the two starts over, and when
   * the repeat is announced, so is this one, read out again.
   */
  readonly again: (announce: boolean, ms: number) => void;
  /** Fulfils `whenClosed`. */
  readonly end: () => void;
}

/** What is on screen or about to be, oldest first. */
let shown: Shown[] = [];
/** The z-index of the newest message in a stack that grows downwards. */
let depth = 0;

let region: HTMLElement | undefined;
/** The live region: only messages, or the button below would be read out as one. */
let list!: HTMLElement;
let clearAll!: HTMLElement;
/** Watches the list and each message, for the fades. */
let watch: ResizeObserver | undefined;
/** A popover opened after the region is above it (see `order`). */
let under = false;
/**
 * Where the focus came into the region from: the page's element (or none). Moving
 * within the region, from message to message, keeps it.
 */
let origin: HTMLElement | null = null;

/** A bottom position: `--notify-flow: column-reverse` shows the DOM upside down. */
const reversed = (): boolean =>
  getComputedStyle(list).flexDirection === 'column-reverse';

/**
 * Fades the edges of the list that have messages beyond them (CSS `.mm-notify-above`
 * and `.mm-notify-below`). On scrolling, and when the list or a message changes size.
 */
function edges(): void {
  const { scrollTop, scrollHeight, clientHeight } = list;
  const end = scrollHeight - clientHeight;
  // A bottom position scrolls from its bottom: 0 there, negative upwards.
  const top = reversed() ? scrollTop + end : scrollTop;
  list.classList.toggle('mm-notify-above', top > 1);
  list.classList.toggle('mm-notify-below', top < end - 1);
}

/**
 * The top layer stacks by opening order: a popover opened after the region is above
 * it. Told before any popover opens or closes (on `window`, capturing: the event
 * doesn't bubble). Browsers without popover never send it.
 */
function order(event: ToggleEvent): void {
  const target = event.target as Element;
  if (target === region) under = false;
  else if (event.newState === 'open' && target.hasAttribute('popover'))
    under = true;
}

/**
 * Puts the region back on top by opening it again, for a new message. It is
 * `display: flex` while closed, so the messages stay as they are; what a browser
 * may lose on the way comes back: the focus (moved out on closing) and the scroll.
 */
function raise(): void {
  if (!under) return;
  const { activeElement } = document;
  const { scrollTop } = list;
  const from = origin;
  setOpen(false);
  setOpen(true);
  list.scrollTop = scrollTop;
  if (document.activeElement !== activeElement)
    (activeElement as HTMLElement | null)?.focus({ preventScroll: true });
  origin = from; // the focus given back came from nowhere
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
  // Taken out of the page: what was in it is gone (closed), what waits for its frame isn't.
  shown = shown.filter((entry) => {
    if (entry.item.parentElement) entry.end();
    return !entry.item.parentElement;
  });
  region = shape('div', { class: 'mm-notify-region', popover: 'manual' }, true);
  list = shape('div', { class: 'mm-notify-list', 'aria-live': 'polite' }, true);
  clearAll = makeButton('mm-notify-clear', () => {
    [...shown].forEach(close);
  });
  showClearAll();
  region.append(list, clearAll);
  document.body.append(region);
  list.addEventListener('scroll', edges);
  // Where the focus comes in from, not where it moves within: back there (see `close`).
  region.addEventListener('focusin', ({ relatedTarget }) => {
    if (!region?.contains(relatedTarget as Node | null))
      origin = relatedTarget as HTMLElement | null;
  });
  // The list changes size with the window, a message as it grows or shrinks: what is
  // beyond an edge with either. Too old a browser: no fades, nothing hidden by one.
  watch?.disconnect();
  try {
    (watch ??= new ResizeObserver(edges)).observe(list);
  } catch {
    // See above.
  }
  // The same listener is added once.
  addEventListener('beforetoggle', order, true);
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

/**
 * The focus on what goes would fall to the page's start: back where it came into the
 * region from, if that is still on the page (and focusable: otherwise `focus()` does
 * nothing). Not where it came into a message from: another message, which may be gone
 * by then. A keyboard's focus comes into sight, as on Tab (out of sight, its ring shows
 * nowhere); a pointer's click on the cross doesn't move the page.
 */
function giveBack(): void {
  let keys = false;
  try {
    keys = !!document.activeElement?.matches(':focus-visible');
  } catch {
    // Too old a browser for `:focus-visible`: in place.
  }
  if (origin?.isConnected) origin.focus({ preventScroll: !keys });
}

function close(entry: Shown): void {
  const at = shown.indexOf(entry);
  if (at < 0) return;
  shown.splice(at, 1);
  entry.end();
  const { item } = entry;
  showClearAll();
  // The focus in it, or on a Clear all that goes with it (its own click, or too few
  // messages left for it).
  const { activeElement } = document;
  if (
    item.contains(activeElement) ||
    (activeElement === clearAll && clearAll.classList.contains(OUT))
  )
    giveBack();
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
    watch?.unobserve(item);
    if (!list.childElementCount) setOpen(false);
  };
  // The CSS transition is 0.3s from the next frame, and reduced motion drops it. A
  // little longer, or a late frame leaves the last pixels to drop at the removal.
  setTimeout(remove, 350);
  if (config.sequential && !at) shown[0]?.sync();
}

/** Numbers the messages' texts, which name their progress bars. */
let ids = 0;

/**
 * Shows a notification and returns its handle, to change it later. The same kind
 * and text as one still on screen shows again only with `configure({ repeats:
 * true })`; otherwise that one starts over, and its handle is returned. A message
 * with a progress bar is no such match: the call shows a message of its own.
 */
export function toast(
  text: string,
  kind: ToastKind = 'neutral',
  options: ToastOptions = {}
): ToastHandle {
  if (text) {
    ownRegion();
    raise();
  }
  const ms = options.timeoutMs ?? config.durations[kind];
  // A message with a progress bar is work in progress, never shared with other work.
  const same =
    text && !config.repeats ?
      shown.find(
        (e) =>
          e.key === `${kind} ${text}` && !e.item.querySelector('.mm-notify-bar')
      )
    : undefined;
  if (same) {
    same.again(options.announce !== false, ms);
    return same;
  }

  const item = document.createElement('div');
  const svg = icon(kind);
  const message = document.createElement('p');
  const button = makeButton('mm-notify-close', () => {
    close(entry);
  });
  item.append(svg, message, button);
  let bar: HTMLElement | undefined;
  let lines: HTMLElement | undefined;
  /** The text as it is now. */
  let now = text;
  /** The words (with their kind) waiting to follow a change of voice. */
  let later: ReturnType<typeof setTimeout> | undefined;
  /**
   * Shows the kind and the words as they are now. The text node is always a new one:
   * a change screen readers read from a live region. An error that is read out is an
   * alert, from the moment its words are there.
   */
  const write = (): void => {
    clearTimeout(later);
    later = undefined;
    if (!item.hasAttribute('aria-live') && kind === 'error')
      item.setAttribute('role', 'alert');
    else item.removeAttribute('role');
    item.className = `mm-notify mm-notify-${kind}`;
    (svg.lastChild as SVGElement).setAttribute('d', ICONS[kind]);
    message.textContent = now;
    grow();
  };
  /**
   * Read out or not, from now on, and the words. Unannounced: its own box is no live
   * region, which takes it out of the list's (the nearest `aria-live` counts). Not
   * `aria-hidden`: its close button is focusable. A message on the page that was
   * unannounced joins the live region first and its words follow 100 ms later, the
   * way a status line is made reliable: a screen reader may miss words that come
   * with the change. Words waiting for that take the latest.
   */
  const say = (loud: boolean): void => {
    const joins =
      loud && item.isConnected && item.getAttribute('aria-live') === 'off';
    if (loud) item.removeAttribute('aria-live');
    else item.setAttribute('aria-live', 'off');
    if (joins) {
      clearTimeout(later);
      later = setTimeout(() => {
        if (!entry.closed) write();
      }, 100);
    } else if (!later) write();
  };
  /**
   * The contents, all at once. `fresh`: as a new message (`replace`, and the first).
   * The text node is always a new one: a change screen readers read from a live region.
   */
  const set = (
    words: string,
    to: ToastKind = kind,
    { announce, timeoutMs, closeLabel }: ToastOptions,
    fresh: boolean
  ): Shown => {
    if (entry.closed) return entry;
    const moved = to !== kind;
    kind = to;
    duration =
      timeoutMs ?? (moved || fresh ? config.durations[kind] : duration);
    if (fresh) {
      // A focused log keeps the focus in the message, and its hold, on the cross.
      if (lines?.contains(document.activeElement)) button.focus();
      bar?.remove();
      lines?.remove();
      bar = lines = undefined;
    }
    button.setAttribute(
      'aria-label',
      closeLabel ?? button.getAttribute('aria-label') ?? config.closeLabel
    );
    now = words || now;
    entry.key = `${kind} ${now}`;
    // Not on the page yet (before its frame), or its words still to come after joining
    // the live region: new words keep the voice it came with, or an announced message
    // would end up silent; the words read are the latest.
    say(
      announce ??
        (moved ||
          fresh ||
          ((!item.isConnected || !!later) && !item.hasAttribute('aria-live')))
    );
    return changed();
  };
  /** A message still growing grows to its contents now (an overestimate is harmless). */
  const grow = (): void => {
    if (item.isConnected)
      item.style.setProperty('--mm-notify-height', `${item.scrollHeight}px`);
  };
  /** After any change: grow to it, and start the time over. */
  const changed = (): Shown => {
    grow();
    entry.sync();
    return entry;
  };

  // Counts down only on the page, while neither the pointer nor the focus is on
  // it nor a progress bar shows, and when sequential only as the oldest.
  let duration = ms;
  let holds = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let end!: () => void;
  const entry: Shown = {
    item,
    sync() {
      clearTimeout(timer);
      // 2^31 ms or more (Infinity too) would overflow the timer and close at once.
      if (
        duration > 0 &&
        duration < 2 ** 31 &&
        !holds &&
        !bar &&
        item.isConnected &&
        (!config.sequential || shown[0] === entry)
      )
        timer = setTimeout(() => {
          close(entry);
        }, duration);
    },
    key: '',
    again(announce, time) {
      // Until closed (0 or less) is the longest: a repeat never shortens a message.
      if (duration > 0 && (time <= 0 || time > duration)) duration = time;
      // Shown unannounced before: in the live region now, or nothing would be read.
      if (announce) say(true);
      entry.sync();
    },
    end: () => {
      end();
    },
    whenClosed: new Promise((resolve) => {
      end = resolve;
    }),
    get closed() {
      return !shown.includes(entry);
    },
    close() {
      close(entry);
    },
    update(words, to, opts = {}) {
      return set(words, to, opts, false);
    },
    replace(words, to, opts = {}) {
      return set(words, to, opts, true);
    },
    progress(value, valueText) {
      if (entry.closed) return entry;
      if (value === false) {
        bar?.remove();
        bar = undefined;
      } else {
        if (!bar) {
          message.id ||= `mm-notify-${++ids}`;
          bar = shape(
            'div',
            {
              class: 'mm-notify-bar',
              role: 'progressbar',
              'aria-labelledby': message.id,
            },
            true
          );
          item.insertBefore(bar, lines ?? null);
        }
        if (value === true) bar.removeAttribute('aria-valuenow');
        else {
          const share = Math.min(1, Math.max(0, value)) || 0;
          bar.setAttribute('aria-valuenow', `${Math.round(share * 100)}`);
          bar.style.setProperty('--mm-notify-value', `${share}`);
        }
        if (valueText) bar.setAttribute('aria-valuetext', valueText);
        else bar.removeAttribute('aria-valuetext');
      }
      return changed();
    },
    log(line) {
      if (entry.closed) return entry;
      if (!lines) {
        // A log, not read out line by line; focusable, so a keyboard can scroll it.
        lines = shape(
          'div',
          {
            class: 'mm-notify-log',
            role: 'log',
            'aria-live': 'off',
            tabindex: '0',
          },
          true
        );
        item.append(lines);
      }
      // At its end (or new): stays at its end, the newest in sight. Scrolled up: stays.
      const atEnd =
        lines.scrollTop + lines.clientHeight >= lines.scrollHeight - 2;
      const row = document.createElement('div');
      row.textContent = line;
      lines.append(row);
      // At least the newest: 0 or less would empty it, and below 0 never stop.
      while (lines.childElementCount > Math.max(1, config.logLines))
        lines.firstElementChild?.remove();
      if (atEnd) lines.scrollTop = lines.scrollHeight;
      return changed();
    },
  };
  if (!text) {
    end();
    return entry; // never shown: closed from the start
  }
  shown.push(entry);
  set(text, kind, options, true);
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

  showClearAll();
  setOpen(true);
  // The next frame: an addition to an existing live region is what screen readers announce.
  requestAnimationFrame(() => {
    if (item.classList.contains(OUT)) return; // cleared before its frame
    ownRegion();
    list.prepend(item); // the start of the stack, where `--notify-flow` puts it
    // What it grows to, moving the stack smoothly: CSS can't animate to `auto`.
    item.style.setProperty('--mm-notify-height', `${item.scrollHeight}px`);
    // Lines logged before it was on the page: the newest in sight.
    if (lines) lines.scrollTop = lines.scrollHeight;
    // A glow falls downwards, so the lower message must paint over the upper. Prepending
    // gives that in `column`; `column-reverse` shows the DOM upside down, so it needs this.
    if (reversed()) item.style.zIndex = String(++depth);
    setOpen(true); // an earlier toast's removal may have closed it since
    // The newest in sight, unless someone is in the list: the keyboard, whose focus stays
    // in sight, or the pointer, which would find another message under it (and close
    // that one with the click it was about to make).
    if (!list.matches(':hover') && !list.contains(document.activeElement))
      list.scrollTop = 0;
    watch?.observe(item);
    entry.sync();
  });
  return entry;
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
      typeof kind === 'string' && Object.hasOwn(ICONS, kind) ?
        (kind as ToastKind)
      : 'neutral'
    );
}
