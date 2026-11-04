/**
 * `@mmutils/notify`: notifications with their CSS. Meant to be loaded on first
 * use: `import('@mmutils/notify').then(({ toast }) => toast('Saved', 'success'))`.
 * `hasFlash` is in `@mmutils/notify/has-flash`. Not re-exported here: a dynamic
 * `import()` keeps every export, so it would land in a chunk shared with the eager
 * code.
 */
export { configure } from './config.js';
export type { NotifyConfig, ToastKind } from './config.js';
export { flash, showFlash, toast } from './toast.js';
export type { ToastOptions } from './toast.js';
