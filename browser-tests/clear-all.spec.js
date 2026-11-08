/** Clear all: when it comes, what a pointer hits, where it sits, and thirty messages. */
import { expect } from '@playwright/test';
import {
  close,
  open,
  openPaused,
  POSITIONS,
  show,
  showAtRest,
  test,
} from './helpers.js';

const clearState = (page) =>
  page.evaluate(() => {
    const { t } = window;
    const button = t.clearAll();
    const style = getComputedStyle(button);
    const box = button.getBoundingClientRect();
    return {
      out: button.classList.contains('mm-notify-out'),
      visibility: style.visibility,
      opacity: +style.opacity,
      zIndex: style.zIndex,
      hit: t.hits(
        button,
        (box.left + box.right) / 2,
        (box.top + box.bottom) / 2
      ),
    };
  });

for (const { name, attribute, sign } of POSITIONS) {
  test.describe(name, () => {
    test('comes from three messages and goes below that', async ({ page }) => {
      await openPaused(page, { position: attribute });
      await showAtRest(page, ['One.', 'Two.']);
      await expect
        .poll(() => clearState(page))
        .toMatchObject({ out: true, visibility: 'hidden', hit: false });

      await showAtRest(page, ['Three.']);
      expect(await clearState(page)).toMatchObject({
        out: false,
        visibility: 'visible',
        opacity: 1,
        zIndex: '1',
        hit: true,
      });

      await page.evaluate(() => {
        window.t.item('Two.').querySelector('.mm-notify-close').click();
        window.t.settle();
      });
      expect(await clearState(page)).toMatchObject({
        out: true,
        visibility: 'hidden',
        opacity: 0,
        zIndex: '-1',
        hit: false,
      });
    });

    test('at rest the button is hit at its corners; while it slides the message on the overlap is', async ({
      page,
    }) => {
      await openPaused(page, { position: attribute });
      await showAtRest(page, ['Oldest.', 'Newer.']);
      const held = await page.evaluate(() =>
        window.t.toastHoldClear('Newest.')
      );
      expect(held.map(({ name: n }) => n)).toEqual(
        expect.arrayContaining(['opacity', 'transform', 'visibility'])
      );
      await page.clock.runFor(20);
      await page.evaluate(() => {
        window.t.settleMessages();
      });

      for (const ms of [30, 60]) {
        const overlap = await page.evaluate((time) => {
          const { t } = window;
          const button = t.clearAll();
          const oldest = t.item('Oldest.');
          t.step(button, time);
          const a = button.getBoundingClientRect();
          const b = oldest.getBoundingClientRect();
          const top = Math.max(a.top, b.top);
          const bottom = Math.min(a.bottom, b.bottom);
          const x = (a.left + a.right) / 2;
          const y = (top + bottom) / 2;
          return {
            depth: bottom - top,
            opacity: +getComputedStyle(button).opacity,
            onMessage: t.hits(oldest, x, y),
            onButton: t.hits(button, x, y),
          };
        }, ms);
        expect(overlap.depth, `overlap at ${ms} ms`).toBeGreaterThan(1);
        expect(overlap.opacity).toBeGreaterThan(0);
        expect(overlap.opacity).toBeLessThan(1);
        expect(overlap, `at ${ms} ms`).toMatchObject({
          onMessage: true,
          onButton: false,
        });
      }

      const atRest = await page.evaluate(() => {
        const { t } = window;
        const button = t.clearAll();
        t.settle();
        const a = button.getBoundingClientRect();
        return [
          [a.left + 3, a.top + 3],
          [a.right - 3, a.top + 3],
          [a.left + 3, a.bottom - 3],
          [a.right - 3, a.bottom - 3],
          [(a.left + a.right) / 2, (a.top + a.bottom) / 2],
        ].map(([x, y]) => t.hits(button, x, y));
      });
      expect(atRest).toEqual([true, true, true, true, true]);
    });

    test('the gap to the last message is the message gap', async ({ page }) => {
      await openPaused(page, { position: attribute });
      await showAtRest(page, ['Oldest.', 'Newer.', 'Newest.']);
      const seen = await page.evaluate(() => {
        const { t } = window;
        return {
          clear: t.box(t.clearAll()),
          oldest: t.boxOf('Oldest.'),
          newer: t.boxOf('Newer.'),
          newest: t.boxOf('Newest.'),
        };
      });
      // Oldest at the far end from the edge the stack starts at, the button beyond it.
      const gap =
        sign < 0 ?
          seen.clear.top - seen.oldest.bottom
        : seen.oldest.top - seen.clear.bottom;
      const between =
        sign < 0 ?
          seen.newer.top - seen.newest.bottom
        : seen.newest.top - seen.newer.bottom;
      close(between, 10, 0.1, 'between messages');
      close(gap, between, 0.1, 'to the button');
    });

    test('with thirty messages the button is pinned on screen, the newest too, and a click clears all', async ({
      page,
    }) => {
      await open(page, { position: attribute });
      await page.locator('#flood').dispatchEvent('click');
      await expect(page.locator('.mm-notify')).toHaveCount(30);
      const view = () =>
        page.evaluate(() => {
          const { t } = window;
          t.settle();
          const button = t.clearAll();
          const box = button.getBoundingClientRect();
          const rect = t.item('Permanent message 30.').getBoundingClientRect();
          return {
            innerHeight,
            scrollY,
            pinned: document
              .querySelector('.mm-notify-region')
              .classList.contains('mm-notify-pinned'),
            button: { top: box.top, bottom: box.bottom },
            hit: t.hits(
              button,
              (box.left + box.right) / 2,
              (box.top + box.bottom) / 2
            ),
            newest: { top: rect.top, bottom: rect.bottom },
          };
        });
      await expect.poll(async () => (await view()).pinned).toBe(true);
      const seen = await view();
      expect(seen.hit).toBe(true);
      expect(seen.scrollY).toBe(0);
      expect(seen.button.top).toBeGreaterThanOrEqual(0);
      expect(seen.button.bottom).toBeLessThanOrEqual(seen.innerHeight);
      expect(seen.newest.top).toBeGreaterThanOrEqual(0);
      expect(seen.newest.bottom).toBeLessThanOrEqual(seen.innerHeight);

      // A real click, which Playwright does only on what the point really hits.
      await page.locator('.mm-notify-clear').click();
      await expect(page.locator('.mm-notify')).toHaveCount(0);
      await expect
        .poll(() => page.evaluate(() => window.t.regionOpen()))
        .toBe(false);
      expect((await clearState(page)).visibility).toBe('hidden');
    });

    test('clearAllFrom: 0 never shows it', async ({ page }) => {
      await openPaused(page, { position: attribute });
      await page.evaluate(() => window.t.configure({ clearAllFrom: 0 }));
      await show(page, ['One.']);
      expect((await clearState(page)).out).toBe(true);
      await showAtRest(page, ['Two.', 'Three.', 'Four.', 'Five.']);
      expect(await clearState(page)).toMatchObject({
        out: true,
        visibility: 'hidden',
        opacity: 0,
        hit: false,
      });
      expect(await page.locator('.mm-notify').count()).toBe(5);
    });
  });
}
