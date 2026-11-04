import { config } from './config.js';
import css from './notify.css';

const ID = 'mm-notify-css';

/** Adds the package's CSS to the page, once. */
export function injectStyles(): void {
  if (!config.injectCss || document.getElementById(ID)) return;
  const style = document.createElement('style');
  style.id = ID;
  style.textContent = css;
  document.head.append(style);
}
