import { describe, expect, it } from 'vitest';
import { css } from './css.js';
import injected from './notify.css';

describe('@mmutils/notify/css', () => {
  it('is the string the package injects', () => {
    expect(css).toBe(injected);
    expect(css).toContain('.mm-notify-region{');
  });

  it('carries the default colors, for a site that checks them', () => {
    for (const [kind, color] of Object.entries({
      success: '#00e77f',
      error: '#ef403c',
      alert: '#ffd556',
      neutral: '#3ec9ff',
    }))
      expect(css).toContain(`background:var(--notify-${kind},${color})`);
  });
});
