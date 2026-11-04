/**
 * `@mmutils/notify/flash`: one message carried across a redirect in
 * `sessionStorage`. This module is what a page may load eagerly: it holds no
 * toast code and no CSS, so "is a flash waiting?" costs almost nothing and the
 * rest is imported only when the answer is yes.
 */
import { config, type ToastKind } from './config.js';

export { configure } from './config.js';
export type { NotifyConfig, ToastKind } from './config.js';

/** Leaves a notification for the next page. Storage off: the message is lost, nothing else. */
export function flash(text: string, kind: ToastKind = 'success'): void {
  try {
    sessionStorage.setItem(config.flashKey, JSON.stringify({ text, kind }));
  } catch {
    // Lost, on purpose.
  }
}

/** Whether a message waits for `showFlash`. False when storage is off. */
export function hasFlash(): boolean {
  try {
    return sessionStorage.getItem(config.flashKey) !== null;
  } catch {
    return false;
  }
}
