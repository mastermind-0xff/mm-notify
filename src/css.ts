/**
 * `@mmutils/notify/css`: the package's CSS as the minified string the main entry
 * injects, for a site that checks or bundles it itself (a color test, a build step).
 * Its own entry: neither the lazy main entry nor the eager `has-flash` carries it.
 */
import text from './notify.css';

/** The minified CSS of the package, the same string it injects. */
export const css: string = text;
