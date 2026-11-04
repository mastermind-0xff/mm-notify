/**
 * The server side: importing the package must not touch the DOM, so shared code
 * can import it. This spec runs in plain Node, without happy-dom.
 */
import { describe, expect, it } from 'vitest';

describe('on the server', () => {
  it('runs without a document', () => {
    expect(typeof document).toBe('undefined');
    expect(typeof sessionStorage).toBe('undefined');
  });

  it('imports both entries, which share nothing', async () => {
    const main = await import('./index.js');
    const eager = await import('./has-flash.js');
    expect(Object.keys(main).sort()).toEqual([
      'configure',
      'flash',
      'showFlash',
      'toast',
    ]);
    expect(Object.keys(eager)).toEqual(['hasFlash']);
  });

  it('has no storage to fail on: the flash functions stay silent', async () => {
    const { hasFlash } = await import('./has-flash.js');
    const { flash, showFlash } = await import('./index.js');
    expect(() => {
      flash('Hi');
    }).not.toThrow();
    expect(hasFlash()).toBe(false);
    expect(() => {
      showFlash();
    }).not.toThrow();
  });
});
