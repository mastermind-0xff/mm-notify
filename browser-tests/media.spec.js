/** Real reduced motion, a real narrow window, and the simulated browser without popover. */
import { expect } from '@playwright/test';
import {
  MULTI_LINE,
  open,
  openPaused,
  POSITIONS,
  showAtRest,
  test,
} from './helpers.js';

test.describe('prefers-reduced-motion', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  for (const { name, attribute } of POSITIONS) {
    test(`${name}: no motion, and the removal still happens`, async ({
      page,
    }) => {
      await openPaused(page, { position: attribute });
      expect(
        await page.evaluate(
          () => matchMedia('(prefers-reduced-motion: reduce)').matches
        )
      ).toBe(true);

      await showAtRest(page, ['Older.', MULTI_LINE, 'Newer.', 'Newest.']);
      // No growth: nothing runs on any message or on the button, at any time.
      const arrived = await page.evaluate((text) => {
        const { t } = window;
        return {
          running: document.getAnimations().length,
          item: t.boxOf(text),
          clear: getComputedStyle(t.clearAll()).opacity,
        };
      }, MULTI_LINE);
      expect(arrived.running).toBe(0);
      expect(arrived.item.height).toBeGreaterThan(50);
      expect(arrived.clear).toBe('1');

      const closed = await page.evaluate((text) => {
        const { t } = window;
        const before = t.boxOf('Older.');
        const held = t.closeHeld(text);
        return {
          held,
          running: document.getAnimations().length,
          item: t.boxOf(text),
          moved: t.boxOf('Older.').top - before.top,
        };
      }, MULTI_LINE);
      expect(closed.held).toEqual([]);
      expect(closed.running).toBe(0);
      expect(closed.item.height).toBe(0);
      expect(closed.item.marginBottom).toBe(0);
      expect(Math.abs(closed.moved)).toBeGreaterThan(50);

      // Removed on the same timer, by the same code.
      await page.clock.runFor(340);
      await expect(page.locator('.mm-notify')).toHaveCount(4);
      await page.clock.runFor(20);
      await expect(page.locator('.mm-notify')).toHaveCount(3);

      await page.locator('.mm-notify-clear').click();
      expect(await page.evaluate(() => document.getAnimations().length)).toBe(
        0
      );
      await page.clock.runFor(360);
      await expect(page.locator('.mm-notify')).toHaveCount(0);
      expect(await page.evaluate(() => window.t.regionOpen())).toBe(false);
    });
  }

  test('in real time: a 1 s message comes and goes with no animation', async ({
    page,
  }) => {
    await open(page);
    await page.evaluate(() =>
      window.t.toast('Brief.', 'success', { timeoutMs: 1_000 })
    );
    await expect(page.locator('.mm-notify')).toBeVisible();
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    await expect(page.locator('.mm-notify')).toHaveCount(0, { timeout: 5_000 });
    expect(await page.evaluate(() => window.t.regionOpen())).toBe(false);
  });
});

test.describe('a real window of 390 px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const search of ['', '?no-popover']) {
    test(`a long e-mail wraps and the cross stays inside${search && ', without popover'}`, async ({
      page,
    }) => {
      await open(page, { search });
      await page.locator('#long').dispatchEvent('click');
      const item = page.locator('.mm-notify');
      await expect(item).toBeVisible();
      const seen = await page.evaluate(() => {
        const { t } = window;
        t.settle();
        const box = document.querySelector('.mm-notify');
        const text = box.querySelector('p');
        const cross = box.querySelector('.mm-notify-close');
        const rect = (e) => e.getBoundingClientRect();
        return {
          innerWidth,
          page: document.documentElement.scrollWidth,
          box: rect(box).toJSON(),
          cross: rect(cross).toJSON(),
          text: rect(text).toJSON(),
          lineHeight: parseFloat(getComputedStyle(text).lineHeight),
          textOverflow: text.scrollWidth - text.clientWidth,
          boxOverflow: box.scrollWidth - box.clientWidth,
          hit: t.hits(
            cross,
            (rect(cross).left + rect(cross).right) / 2,
            (rect(cross).top + rect(cross).bottom) / 2
          ),
        };
      });
      expect(seen.innerWidth).toBe(390);
      // 16 px gutters.
      expect(seen.box.left).toBeCloseTo(16, 0);
      expect(seen.box.right).toBeCloseTo(374, 0);
      expect(seen.text.height).toBeGreaterThan(1.5 * seen.lineHeight);
      expect(seen.textOverflow).toBeLessThanOrEqual(0);
      expect(seen.boxOverflow).toBeLessThanOrEqual(0);
      expect(seen.cross.left).toBeGreaterThanOrEqual(seen.box.left);
      expect(seen.cross.right).toBeLessThanOrEqual(seen.box.right);
      expect(seen.text.right).toBeLessThanOrEqual(seen.cross.left);
      expect(seen.hit).toBe(true);
      expect(seen.page).toBeLessThanOrEqual(390);
    });
  }

  for (const { name, attribute } of POSITIONS) {
    test(`${name}: thirty messages scroll in 2/3 of the window, with the button on screen`, async ({
      page,
    }) => {
      await open(page, { position: attribute });
      await page.locator('#flood').dispatchEvent('click');
      await expect(page.locator('.mm-notify')).toHaveCount(30);
      const seen = await page.evaluate(() => {
        const { t } = window;
        t.settle();
        const box = t.clearAll().getBoundingClientRect();
        const list = document.querySelector('.mm-notify-list');
        return {
          top: box.top,
          bottom: box.bottom,
          height: innerHeight,
          region: document
            .querySelector('.mm-notify-region')
            .getBoundingClientRect().height,
          scrolls: list.scrollHeight > list.clientHeight,
          left: document.querySelector('.mm-notify').getBoundingClientRect()
            .left,
        };
      });
      expect(seen.top).toBeGreaterThanOrEqual(0);
      expect(seen.bottom).toBeLessThanOrEqual(seen.height);
      expect(seen.left).toBeGreaterThanOrEqual(0);
      expect(seen.scrolls).toBe(true);
      expect(seen.region).toBeLessThanOrEqual((seen.height * 2) / 3 + 1);
    });
  }
});

test.describe('?no-popover (a simulation: the methods are deleted)', () => {
  test('shown as a plain fixed element, above the header, and cleared', async ({
    page,
  }) => {
    await open(page, { search: '?no-popover' });
    expect(
      await page.evaluate(() => typeof HTMLElement.prototype.togglePopover)
    ).toBe('undefined');
    await page.locator('#three').dispatchEvent('click');
    await expect(page.locator('.mm-notify')).toHaveCount(3);
    const seen = await page.evaluate(() => {
      const { t } = window;
      t.settle();
      const region = document.querySelector('.mm-notify-region');
      const item = document.querySelector('.mm-notify');
      const box = item.getBoundingClientRect();
      const bar = document.querySelector('.bar').getBoundingClientRect();
      return {
        open: t.regionOpen(),
        position: getComputedStyle(region).position,
        display: getComputedStyle(region).display,
        overHeader:
          box.top < bar.bottom &&
          t.hits(
            item,
            (box.left + box.right) / 2,
            (box.top + Math.min(box.bottom, bar.bottom)) / 2
          ),
      };
    });
    expect(seen).toEqual({
      open: false,
      position: 'fixed',
      display: 'flex',
      overHeader: true,
    });
    await page.locator('.mm-notify-clear').click();
    await expect(page.locator('.mm-notify')).toHaveCount(0);
  });

  test('an open menu is above it there, as documented, and nothing throws', async ({
    page,
  }) => {
    await open(page, { search: '?no-popover' });
    await page.locator('[popovertarget="menu"]').click();
    await page.locator('#menu [data-kind="success"]').click();
    await expect(page.locator('.mm-notify')).toBeVisible();
    await expect(page.locator('#menu')).toBeVisible();
  });
});
