/** The timers: Playwright's clock for the exact times, real time once to see it holds. */
import { expect } from '@playwright/test';
import { open, openPaused, showAtRest, test } from './helpers.js';

const up = (page) => page.locator('.mm-notify:not(.mm-notify-out)');

async function showKind(page, text, kind, options) {
  await page.evaluate(
    ([t, k, o]) => window.t.toast(t, k, o ?? undefined),
    [text, kind, options ?? null]
  );
  await page.clock.runFor(20);
  await page.evaluate(() => {
    window.t.settle();
  });
}

for (const kind of ['success', 'neutral']) {
  test(`${kind} closes after 5 s and is gone after its closing`, async ({
    page,
  }) => {
    await openPaused(page);
    await showKind(page, 'Timed.', kind);
    await page.clock.runFor(4_980);
    await expect(up(page)).toHaveCount(1);
    await page.clock.runFor(40);
    await expect(up(page)).toHaveCount(0);
    await expect(page.locator('.mm-notify')).toHaveCount(1); // closing
    await page.clock.runFor(360);
    await expect(page.locator('.mm-notify')).toHaveCount(0);
    expect(await page.evaluate(() => window.t.regionOpen())).toBe(false);
  });
}

// Nothing stays until closed by default (aesweets D34): alert 8 s, error 10 s.
for (const [kind, ms] of [
  ['alert', 8_000],
  ['error', 10_000],
]) {
  test(`${kind} closes after ${ms / 1000} s`, async ({ page }) => {
    await openPaused(page);
    await showKind(page, 'Timed.', kind);
    await page.clock.runFor(ms - 20);
    await expect(up(page)).toHaveCount(1);
    await page.clock.runFor(40);
    await expect(up(page)).toHaveCount(0);
    await page.clock.runFor(360);
    await expect(page.locator('.mm-notify')).toHaveCount(0);
  });
}

test('the same kind and text again starts the one on screen over, once', async ({
  page,
}) => {
  await openPaused(page);
  await showKind(page, 'Saved.', 'success');
  await page.clock.runFor(4_000);
  await showKind(page, 'Saved.', 'success');
  await expect(page.locator('.mm-notify')).toHaveCount(1);
  await page.clock.runFor(4_960);
  await expect(up(page)).toHaveText(['Saved.']);
  await page.clock.runFor(60);
  await expect(up(page)).toHaveCount(0);
});

test('repeats: true shows the same text again', async ({ page }) => {
  await openPaused(page);
  await page.evaluate(() => window.t.configure({ repeats: true }));
  await showKind(page, 'Saved.', 'success');
  await showKind(page, 'Saved.', 'success');
  await expect(up(page)).toHaveText(['Saved.', 'Saved.']);
});

test('timeoutMs sets the time, 0 keeps it', async ({ page }) => {
  await openPaused(page);
  await showKind(page, 'Short.', 'success', { timeoutMs: 1_000 });
  await showKind(page, 'Kept.', 'success', { timeoutMs: 0 });
  await page.clock.runFor(960);
  await expect(up(page)).toHaveCount(2);
  await page.clock.runFor(60);
  await expect(up(page)).toHaveText(['Kept.']);
  await page.clock.runFor(60_000);
  await expect(up(page)).toHaveText(['Kept.']);
});

test('hover holds, and leaving starts the full time over', async ({ page }) => {
  await openPaused(page);
  await showKind(page, 'Held.', 'success');
  await page.clock.runFor(3_000);
  await page.locator('.mm-notify').hover();
  await page.clock.runFor(30_000);
  await expect(up(page)).toHaveCount(1);
  await page.mouse.move(1, 700);
  await page.clock.runFor(4_980);
  await expect(up(page)).toHaveCount(1);
  await page.clock.runFor(40);
  await expect(up(page)).toHaveCount(0);
});

test('focus holds, and leaving starts the full time over', async ({ page }) => {
  await openPaused(page);
  await showKind(page, 'Held.', 'success');
  await page.clock.runFor(3_000);
  await page.locator('.mm-notify-close').focus();
  await page.clock.runFor(30_000);
  await expect(up(page)).toHaveCount(1);
  await page.locator('.mm-notify-close').blur();
  await page.clock.runFor(4_980);
  await expect(up(page)).toHaveCount(1);
  await page.clock.runFor(40);
  await expect(up(page)).toHaveCount(0);
});

test('with both on it, it counts only when both have left', async ({
  page,
}) => {
  await openPaused(page);
  await showKind(page, 'Held.', 'success');
  await page.locator('.mm-notify').hover();
  await page.locator('.mm-notify-close').focus();
  await page.mouse.move(1, 700);
  await page.clock.runFor(30_000);
  await expect(up(page)).toHaveCount(1);
  await page.locator('.mm-notify').hover();
  await page.locator('.mm-notify-close').blur();
  await page.clock.runFor(30_000);
  await expect(up(page)).toHaveCount(1);
  await page.mouse.move(1, 700);
  await page.clock.runFor(4_980);
  await expect(up(page)).toHaveCount(1);
  await page.clock.runFor(40);
  await expect(up(page)).toHaveCount(0);
});

/** The page's own controls: its checkbox, its button. */
async function pageButton(page, selector) {
  await page.locator(selector).dispatchEvent('click');
  await page.evaluate(() => window.t.load());
  await page.clock.runFor(20);
  await page.evaluate(() => {
    window.t.settle();
  });
}

test('sequential: three of 5 s close at 5, 10 and 15 s', async ({ page }) => {
  await openPaused(page);
  await page.locator('#sequential').check();
  await page.evaluate(() => window.t.load());
  await pageButton(page, '#three');
  await expect(up(page)).toHaveCount(3);
  // Absolute times, 20 ms into the first frame already: each closes a frame's time after
  // a whole 5 s, and these look 50 ms either side.
  for (const left of [2, 1, 0]) {
    await page.clock.runFor(left === 2 ? 4_930 : 4_900);
    await expect(up(page)).toHaveCount(left + 1);
    await page.clock.runFor(100);
    await expect(up(page)).toHaveCount(left);
  }
  await page.clock.runFor(360);
  await expect(page.locator('.mm-notify')).toHaveCount(0);
});

test('without sequential, three of 5 s close together', async ({ page }) => {
  await openPaused(page);
  await pageButton(page, '#three');
  await expect(up(page)).toHaveCount(3);
  await page.clock.runFor(4_960);
  await expect(up(page)).toHaveCount(3);
  await page.clock.runFor(60);
  await expect(up(page)).toHaveCount(0);
});

test('sequential: a permanent message holds those behind it, until closed', async ({
  page,
}) => {
  await openPaused(page);
  await page.locator('#sequential').check();
  await page.evaluate(() => window.t.load());
  await pageButton(page, '#held');
  await expect(up(page)).toHaveCount(3);
  await page.clock.runFor(5_020);
  await expect(up(page)).toHaveCount(2);
  await page.clock.runFor(60_000);
  await expect(up(page)).toHaveCount(2);

  await page.locator('.mm-notify-error .mm-notify-close').click();
  await expect(up(page)).toHaveCount(1);
  await page.mouse.move(1, 700);
  await page.clock.runFor(4_960);
  await expect(up(page)).toHaveCount(1);
  await page.clock.runFor(60);
  await expect(up(page)).toHaveCount(0);
  await page.clock.runFor(360);
  await expect(page.locator('.mm-notify')).toHaveCount(0);
  expect(await page.evaluate(() => window.t.regionOpen())).toBe(false);
});

test('a real click on the cross closes only that one', async ({ page }) => {
  await openPaused(page);
  await showAtRest(page, ['Stays.', 'Goes.']);
  await page
    .locator('.mm-notify', { hasText: 'Goes.' })
    .locator('.mm-notify-close')
    .click();
  await expect(up(page)).toHaveText(['Stays.']);
});

test('in real time: three of 5 s are gone at about 5.35 s, the popover with them', async ({
  page,
}) => {
  await open(page);
  // Timed inside the page: a loaded machine can stall the test's own round trips by seconds.
  const times = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const added = [];
        const removed = [];
        new MutationObserver((records) => {
          for (const { addedNodes, removedNodes } of records) {
            for (const node of addedNodes)
              if (node.classList?.contains('mm-notify'))
                added.push(performance.now());
            for (const node of removedNodes)
              if (node.classList?.contains('mm-notify'))
                removed.push(performance.now());
          }
          if (removed.length === 3) resolve({ added, removed });
        }).observe(document.body, { childList: true, subtree: true });
        document.querySelector('#three').click();
      })
  );
  times.removed.forEach((at, index) => {
    const took = at - times.added[index];
    expect(took).toBeGreaterThanOrEqual(5_340); // 5 s + the removal's 350, less timer rounding
    expect(took).toBeLessThan(8_000); // room for a loaded machine, not for a second timer
  });
  await expect
    .poll(() => page.evaluate(() => window.t.regionOpen()))
    .toBe(false);
});
