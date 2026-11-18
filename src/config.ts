/** What a site may change, set once with `configure`. */

export type ToastKind = 'success' | 'error' | 'alert' | 'neutral';

export interface NotifyConfig {
  /** The close button's label, for screen readers. */
  readonly closeLabel?: string;
  /** The clear-all button's text. */
  readonly clearAllLabel?: string;
  /** How many messages bring up the clear-all button. `0` or `Infinity`: never. */
  readonly clearAllFrom?: number;
  /** Milliseconds on screen per kind; 0 or `Infinity` keeps it until closed. */
  readonly durations?: Readonly<Partial<Record<ToastKind, number>>>;
  /** Off when the page loads `@mmutils/notify/notify.css` itself. */
  readonly injectCss?: boolean;
  /**
   * How many lines a message's log keeps (`log()`), at least 1; older ones are
   * dropped. `Infinity` keeps them all.
   */
  readonly logLines?: number;
  /**
   * Whether a message whose kind and text equal one still on screen shows as a
   * new message. Off: the one on screen starts over, with the longer of the two
   * times, and is read out again unless the repeat has `announce: false`.
   */
  readonly repeats?: boolean;
  /**
   * One timer at a time, oldest message first: the next starts when the one
   * before has closed, so a message that stays until closed holds those behind it.
   */
  readonly sequential?: boolean;
}

/**
 * The current values (package internal). Neither these nor `durations` have a
 * prototype: `Object.assign` would take a "__proto__" key of options parsed from
 * JSON as a new one. The type leaves that key out of the declarations, and still
 * wants a default for every option.
 */
export const config = {
  __proto__: null,
  closeLabel: 'Close the message',
  clearAllLabel: 'Clear all',
  clearAllFrom: 3,
  durations: {
    __proto__: null,
    success: 5000,
    neutral: 5000,
    alert: 8000,
    error: 10_000,
  } as Record<ToastKind, number>,
  injectCss: true,
  logLines: 100,
  repeats: false,
  sequential: false,
} as Required<Omit<NotifyConfig, 'durations'>> & {
  durations: Record<ToastKind, number>;
};

/** Changes the defaults. Only the given values change. */
export function configure(options: NotifyConfig): void {
  const { durations, ...rest } = options;
  Object.assign(config, rest);
  Object.assign(config.durations, durations);
}
