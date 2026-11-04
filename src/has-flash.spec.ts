// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hasFlash } from './has-flash.js';
import { flash, showFlash } from './toast.js';

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('hasFlash', () => {
  it('tells whether a message waits, without taking it', () => {
    expect(hasFlash()).toBe(false);
    sessionStorage.setItem('mm-notify.flash', '{}');
    expect(hasFlash()).toBe(true);
    expect(hasFlash()).toBe(true);
  });

  it('takes another key', () => {
    sessionStorage.setItem('mm-notify.flash', '{}');
    expect(hasFlash('shop.flash')).toBe(false);
    sessionStorage.setItem('shop.flash', '{}');
    expect(hasFlash('shop.flash')).toBe(true);
  });

  it('is false when storage fails', () => {
    vi.stubGlobal('sessionStorage', {
      getItem() {
        throw new DOMException('Denied', 'SecurityError');
      },
    });
    expect(hasFlash()).toBe(false);
  });

  it('meets flash and showFlash on the same default key', () => {
    flash('Hi');
    expect(hasFlash()).toBe(true);
    showFlash();
    expect(hasFlash()).toBe(false);
  });

  it('imports nothing, so no chunk is shared with the lazy entry', () => {
    const source = readFileSync(
      join(import.meta.dirname, 'has-flash.ts'),
      'utf8'
    );
    expect(source).not.toMatch(/^(import|export .* from)/m);
  });
});
