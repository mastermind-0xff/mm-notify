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

  it('imports both entries', async () => {
    const main = await import('./index.js');
    const eager = await import('./flash.js');
    expect(Object.keys(main).sort()).toEqual([
      'configure',
      'flash',
      'hasFlash',
      'showFlash',
      'toast',
    ]);
    expect(Object.keys(eager).sort()).toEqual([
      'configure',
      'flash',
      'hasFlash',
    ]);
  });

  it('has no storage to fail on: the flash functions stay silent', async () => {
    const { flash, hasFlash, showFlash } = await import('./index.js');
    expect(() => {
      flash('Hi');
    }).not.toThrow();
    expect(hasFlash()).toBe(false);
    expect(showFlash).not.toThrow();
  });
});
