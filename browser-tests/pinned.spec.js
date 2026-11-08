/**
 * A stack taller than the screen: clear all is pinned to the far edge as a full row
 * over the messages, measured from the site's own offset (aesweets: under its header),
 * and goes back after the messages when they fit again. No `dvh` involved.
 */
import { expect } from '@playwright/test';
import { close, open, POSITIONS, test } from './helpers.js';

/** aesweets' header: the stack starts 4.25rem down (68 px). */
const HEADER = '4.25rem';
const VIEWPORT = { width: 800, height: 420 };

const tokens = (page, values) =>
  page.evaluate((all) => {
    for (const [name, value] of Object.entries(all))
      document.documentElement.style.setProperty(name, value);
  }, values);

const state = (page) =>
  page.evaluate(() => {
    const { t } = window;
    t.settle();
    const region = document.querySelector('.mm-notify-region');
    const button = t.clearAll();
    const box = button.getBoundingClientRect();
    const area = region.getBoundingClientRect();
    const items = [...document.querySelectorAll('.mm-notify')].map((item) =>
      item.getBoundingClientRect()
    );
    // The messages on screen: the newest is the first in the DOM.
    const newest = items[0];
    const oldest = items[items.length - 1];
    return {
      pinned: region.classList.contains('mm-notify-pinned'),
      innerHeight,
      button: {
        top: box.top,
        bottom: box.bottom,
        left: box.left,
        right: box.right,
      },
      region: { left: area.left, right: area.right },
      newest: newest && { top: newest.top, bottom: newest.bottom },
      oldest: oldest && { top: oldest.top, bottom: oldest.bottom },
      count: items.length,
      hit: t.hits(
        button,
        (box.left + box.right) / 2,
        (box.top + box.bottom) / 2
      ),
      // What sits under the button: a message, which it must cover.
      covers: items.some(
        (rect) => rect.top < box.bottom && rect.bottom > box.top
      ),
      visible: getComputedStyle(button).visibility,
    };
  });

/** Shows permanent messages, one per call, in real time. */
const add = async (page, from, to, options = { timeoutMs: 0 }) => {
  await page.evaluate(
    async ([a, b, o]) => {
      for (let n = a; n <= b; n += 1)
        await window.t.toast(`Message ${n}.`, 'neutral', o);
    },
    [from, to, options]
  );
  await expect(page.locator('.mm-notify')).toHaveCount(to);
};

const settled = (page, expected) =>
  expect.poll(async () => (await state(page)).pinned).toBe(expected);

for (const { name, attribute, sign } of POSITIONS) {
  for (const search of ['', '?no-popover']) {
    const label = `${name}${search && ', without popover'}`;
    test.describe(`a stack taller than the screen, ${label}`, () => {
      test.beforeEach(async ({ page }) => {
        await page.setViewportSize(VIEWPORT);
        await open(page, { position: attribute, search });
        // Top: under a header like aesweets'. Bottom: the pinned button stays below it.
        await tokens(
          page,
          sign < 0 ? { '--notify-top': HEADER } : { '--notify-pin-top': HEADER }
        );
      });

      test('fits: the button sits after the messages, not pinned', async ({
        page,
      }) => {
        await add(page, 1, 3);
        await settled(page, false);
        const seen = await state(page);
        expect(seen.visible).toBe('visible');
        if (sign < 0) {
          close(seen.newest.top, 68, 0.5, 'under the header');
          close(seen.button.top, seen.oldest.bottom + 10, 0.5, 'after them');
        } else {
          // 1.5rem of room for the glow, and the message's own margin (as on main).
          close(seen.newest.bottom, seen.innerHeight - 34, 0.5, 'room below');
          close(seen.button.bottom, seen.oldest.top - 10, 0.5, 'above them');
        }
        expect(seen.covers).toBe(false);
      });

      test('pins a full row to the far edge, over the messages, and lets go as they close', async ({
        page,
        problems,
      }, testInfo) => {
        if (testInfo.project.name === 'webkit')
          problems.provoked.push(
            /Refused to apply a stylesheet|style-src-elem: inline/
          );
        await add(page, 1, 9);
        await settled(page, true);
        const seen = await state(page);
        expect(seen.hit).toBe(true);
        expect(seen.covers).toBe(true);
        close(seen.button.left, seen.region.left, 0.5, 'left: full row');
        close(seen.button.right, seen.region.right, 0.5, 'right: full row');
        if (sign < 0) {
          // The newest still starts under the header; the button at the bottom edge.
          close(seen.newest.top, 68, 0.5, 'newest under the header');
          close(seen.button.bottom, seen.innerHeight - 10, 0.5, 'bottom edge');
        } else {
          close(
            seen.newest.bottom,
            seen.innerHeight - 34,
            0.5,
            'newest at the bottom, with room below'
          );
          close(seen.button.top, 68 + 10, 0.5, 'below the header');
        }
        if (!search)
          await page.screenshot({
            path: `test-results/look/${testInfo.project.name}-pinned-${name}.png`,
          });

        // A real click, which Playwright does only on what the point really hits.
        await page.locator('.mm-notify-clear').click();
        await expect(page.locator('.mm-notify')).toHaveCount(0);
        await settled(page, false);
      });

      test('covers the messages while it comes in, not only once it has stopped', async ({
        page,
      }) => {
        await page.evaluate(() => window.t.configure({ clearAllFrom: 9 }));
        await add(page, 1, 8);
        await settled(page, true);
        // Every frame of its 0.3 s fade, three points along the row: never a message.
        const covered = await page.evaluate(async () => {
          await window.t.toast('Message 9.', 'neutral', { timeoutMs: 0 });
          const button = window.t.clearAll();
          const seen = [];
          const start = performance.now();
          while (performance.now() - start < 400) {
            await new Promise((resolve) => requestAnimationFrame(resolve));
            if (getComputedStyle(button).visibility !== 'visible') continue;
            const box = button.getBoundingClientRect();
            for (const x of [0.1, 0.5, 0.9]) {
              const hit = document.elementFromPoint(
                box.left + (box.right - box.left) * x,
                (box.top + box.bottom) / 2
              );
              if (!button.contains(hit))
                seen.push(`${Math.round(performance.now() - start)} ms`);
            }
          }
          return seen;
        });
        expect(covered).toEqual([]);
      });

      test('lets go when messages close on their own', async ({ page }) => {
        await add(page, 1, 4);
        await page.evaluate(async () => {
          for (let n = 5; n <= 9; n += 1)
            await window.t.toast(`Short ${n}.`, 'success', { timeoutMs: 1500 });
        });
        await expect(page.locator('.mm-notify')).toHaveCount(9);
        await settled(page, true);
        await expect(page.locator('.mm-notify')).toHaveCount(4, {
          timeout: 5000,
        });
        await settled(page, false);
        const seen = await state(page);
        if (sign < 0)
          close(
            seen.button.top,
            seen.oldest.bottom + 10,
            0.5,
            'after them again'
          );
        else
          close(
            seen.button.bottom,
            seen.oldest.top - 10,
            0.5,
            'above them again'
          );
      });

      test('follows the window: a taller one lets go, a shorter one pins', async ({
        page,
      }) => {
        await add(page, 1, 6);
        await settled(page, true);
        await page.setViewportSize({ width: 800, height: 900 });
        await settled(page, false);
        await page.setViewportSize(VIEWPORT);
        await settled(page, true);
      });
    });
  }
}

test('the pinned look, under a header', async ({
  page,
  problems,
}, testInfo) => {
  if (testInfo.project.name === 'webkit')
    problems.provoked.push(
      /Refused to apply a stylesheet|style-src-elem: inline/
    );
  await page.setViewportSize({ width: 390, height: 640 });
  await open(page);
  await tokens(page, { '--notify-top': HEADER });
  await page.evaluate(async () => {
    for (const [text, kind] of [
      ['Your changes are saved.', 'success'],
      ['That did not work. Please try again.', 'error'],
      ['Your session ends in five minutes.', 'alert'],
      ['A new version is available.', 'neutral'],
      ['Logged in as someone@example.com.', 'success'],
      ['Another one, to fill the screen of a phone.', 'neutral'],
      ['And one more that does not fit.', 'alert'],
      ['The last one.', 'error'],
    ])
      await window.t.toast(text, kind, { timeoutMs: 0 });
  });
  await settled(page, true);
  await page.waitForTimeout(400);
  await page.screenshot({
    path: `test-results/look/${testInfo.project.name}-pinned-phone.png`,
  });
});
