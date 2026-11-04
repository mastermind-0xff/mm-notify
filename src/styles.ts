import { config } from './config.js';
import css from './notify.css';

const ID = 'mm-notify-css';

let sheet: CSSStyleSheet | undefined;

/**
 * Adds the package's CSS to the page, once. A constructable stylesheet where
 * the browser has one, because a strict `style-src` doesn't block it; a
 * `<style>` where it doesn't (the constructor or `adoptedStyleSheets` throws).
 */
export function injectStyles(): void {
  if (!config.injectCss) return;
  try {
    if (!sheet) {
      sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
    }
    if (!document.adoptedStyleSheets.includes(sheet))
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  } catch {
    if (document.getElementById(ID)) return;
    const style = document.createElement('style');
    style.id = ID;
    style.textContent = css;
    document.head.append(style);
  }
}
