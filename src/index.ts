/**
 * `@mmutils/notify`: notifications with their CSS. Meant to be loaded on first
 * use: `import('@mmutils/notify').then(({ toast }) => toast('Saved', 'success'))`.
 */
export { configure } from './config.js';
export type { NotifyConfig, ToastKind } from './config.js';
export { flash, hasFlash } from './flash.js';
export { showFlash, toast } from './toast.js';
export type { ToastOptions } from './toast.js';
