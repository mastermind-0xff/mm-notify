/** What a site may change, set once with `configure`. */

export type ToastKind = 'success' | 'error' | 'alert' | 'neutral';

export interface NotifyConfig {
  /** The close button's label, for screen readers. */
  readonly closeLabel?: string;
  /** The clear-all button's text. */
  readonly clearAllLabel?: string;
  /** How many messages bring up the clear-all button. `0` or `Infinity`: never. */
  readonly clearAllFrom?: number;
  /** Milliseconds on screen per kind; 0 keeps it until closed. */
  readonly durations?: Readonly<Partial<Record<ToastKind, number>>>;
  /** Off when the page loads `@mmutils/notify/notify.css` itself. */
  readonly injectCss?: boolean;
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

/** The current values (package internal). */
export const config = {
  closeLabel: 'Close the message',
  clearAllLabel: 'Clear all',
  clearAllFrom: 3,
  durations: {
    success: 5000,
    neutral: 5000,
    alert: 8000,
    error: 10_000,
  } as Record<ToastKind, number>,
  injectCss: true,
  repeats: false,
  sequential: false,
};

/** Changes the defaults. Only the given values change. */
export function configure(options: NotifyConfig): void {
  const { durations, ...rest } = options;
  Object.assign(config, rest);
  Object.assign(config.durations, durations);
}
