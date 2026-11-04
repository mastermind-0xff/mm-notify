// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from './config.js';
import { configure, flash, hasFlash } from './flash.js';

const defaults = structuredClone(config);
const KEY = 'mm-notify.flash';

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  configure(defaults);
  vi.unstubAllGlobals();
});

describe('flash', () => {
  it('stores text and kind, success by default', () => {
    flash('Logged in.');
    expect(JSON.parse(sessionStorage.getItem(KEY)!)).toEqual({
      text: 'Logged in.',
      kind: 'success',
    });
    flash('Nope', 'error');
    expect(JSON.parse(sessionStorage.getItem(KEY)!)).toEqual({
      text: 'Nope',
      kind: 'error',
    });
  });

  it('uses the configured key', () => {
    configure({ flashKey: 'shop.flash' });
    flash('Hi');
    expect(sessionStorage.getItem(KEY)).toBeNull();
    expect(sessionStorage.getItem('shop.flash')).not.toBeNull();
  });

  it('loses the message silently when storage fails', () => {
    vi.stubGlobal('sessionStorage', {
      setItem() {
        throw new DOMException('Full', 'QuotaExceededError');
      },
    });
    expect(() => {
      flash('Hi');
    }).not.toThrow();
  });
});

describe('hasFlash', () => {
  it('tells whether a message waits, without taking it', () => {
    expect(hasFlash()).toBe(false);
    flash('Hi');
    expect(hasFlash()).toBe(true);
    expect(hasFlash()).toBe(true);
  });

  it('looks at the configured key', () => {
    sessionStorage.setItem(KEY, '{"text":"Hi"}');
    configure({ flashKey: 'shop.flash' });
    expect(hasFlash()).toBe(false);
  });

  it('is false when storage fails', () => {
    vi.stubGlobal('sessionStorage', {
      getItem() {
        throw new DOMException('Denied', 'SecurityError');
      },
    });
    expect(hasFlash()).toBe(false);
  });
});

describe('the eager entry', () => {
  it('does not import the toast code or the CSS', () => {
    const source = readFileSync(join(import.meta.dirname, 'flash.ts'), 'utf8');
    const imports = [...source.matchAll(/from '(.+)'/g)].map((m) => m[1]);
    expect(new Set(imports)).toEqual(new Set(['./config.js']));
  });
});
