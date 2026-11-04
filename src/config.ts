/** What a site may change, set once with `configure`. */

export type ToastKind = 'success' | 'error' | 'alert' | 'neutral';

export interface NotifyConfig {
  /** The close button's label, for screen readers. */
  readonly closeLabel?: string;
  /** Milliseconds on screen per kind; 0 keeps it until closed. */
  readonly durations?: Readonly<Partial<Record<ToastKind, number>>>;
  /** Off when the page loads `@mmutils/notify/notify.css` itself. */
  readonly injectCss?: boolean;
}

/** The current values (package internal). */
export const config = {
  closeLabel: 'Close the message',
  durations: {
    success: 5000,
    neutral: 5000,
    alert: 8000,
    error: 10_000,
  } as Record<ToastKind, number>,
  injectCss: true,
};

/** Changes the defaults. Only the given values change. */
export function configure(options: NotifyConfig): void {
  const { durations, ...rest } = options;
  Object.assign(config, rest);
  Object.assign(config.durations, durations);
}
