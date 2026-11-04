/**
 * `@mmutils/notify/has-flash`: the one thing a page loads eagerly. It imports
 * nothing and stands alone in its file, on purpose: esbuild splits by file, so
 * anything shared with the lazy entry would become a chunk of its own, one more
 * request on every page. So the default key is a literal here and again in
 * toast.ts; has-flash.spec.ts checks that they meet.
 */

/** Whether a message waits for `showFlash`. False when storage is off. */
export function hasFlash(key = 'mm-notify.flash'): boolean {
  try {
    return sessionStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}
