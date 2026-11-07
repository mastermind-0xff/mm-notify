/** The flash across a real reload, and what a page loads up front. */
import { expect } from '@playwright/test';
import { open, PAGE, test } from './helpers.js';

const KEY = 'mm-notify.flash';

const stored = (page) =>
  page.evaluate((key) => sessionStorage.getItem(key), KEY);

/** The package's files a load asks for, as paths. */
function recordDist(page) {
  const asked = [];
  page.on('request', (request) => {
    const { pathname } = new URL(request.url());
    if (pathname.startsWith('/dist/')) asked.push(pathname);
  });
  return asked;
}

for (const kind of ['success', 'error']) {
  test(`a ${kind} flash comes across a reload, once`, async ({ page }) => {
    await open(page);
    await page.locator(`[data-flash="${kind}"]`).click();
    const item = page.locator(`.mm-notify-${kind}`);
    await expect(item).toHaveText('This message came across the reload.');
    expect(await stored(page)).toBeNull();
    await expect(page.locator('#loaded')).toHaveText('loaded');

    const asked = recordDist(page);
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator('.mm-notify')).toHaveCount(0);
    expect(asked).toEqual(['/dist/esm/has-flash.js']);
  });
}

test('a broken stored value leaves no message and removes the key', async ({
  page,
}) => {
  await open(page);
  await page.locator('#broken').click();
  await expect(page.locator('#loaded')).toHaveText('loaded');
  await page.evaluate(() => window.t.load());
  await expect.poll(() => stored(page)).toBeNull();
  await expect(page.locator('.mm-notify')).toHaveCount(0);
  await expect(page.locator('.mm-notify-region')).toHaveCount(0);

  const asked = recordDist(page);
  await page.reload({ waitUntil: 'networkidle' });
  expect(asked).toEqual(['/dist/esm/has-flash.js']);
});

for (const [what, value, expected] of [
  ['an unknown kind', '{"text":"Odd.","kind":"evil"}', 'neutral'],
  ['an inherited key as kind', '{"text":"Odd.","kind":"toString"}', 'neutral'],
]) {
  test(`${what} shows as neutral`, async ({ page }) => {
    await page.goto(PAGE);
    await page.evaluate(([k, v]) => sessionStorage.setItem(k, v), [KEY, value]);
    await page.reload();
    await expect(page.locator(`.mm-notify-${expected}`)).toHaveText('Odd.');
    expect(await stored(page)).toBeNull();
  });
}

for (const value of ['null', '12', '"text"', '{"text":5}']) {
  test(`a stored ${value} shows nothing and is removed`, async ({ page }) => {
    await page.goto(PAGE);
    await page.evaluate(([k, v]) => sessionStorage.setItem(k, v), [KEY, value]);
    await page.reload();
    await expect(page.locator('#loaded')).toHaveText('loaded');
    await page.evaluate(() => window.t.load());
    await expect.poll(() => stored(page)).toBeNull();
    await expect(page.locator('.mm-notify')).toHaveCount(0);
  });
}

test('only the eager file loads up front; the rest comes with the first message', async ({
  page,
}) => {
  const asked = recordDist(page);
  await page.goto(PAGE, { waitUntil: 'networkidle' });
  expect(asked).toEqual(['/dist/esm/has-flash.js']);
  await expect(page.locator('#loaded')).toHaveText('not loaded yet');
  expect(await page.locator('.mm-notify-region').count()).toBe(0);
  expect(await page.evaluate(() => document.adoptedStyleSheets.length)).toBe(0);
  expect(await page.evaluate(() => sessionStorage.length)).toBe(0);

  await page.locator('.row [data-kind="neutral"]').click();
  await expect(page.locator('.mm-notify')).toBeVisible();
  await expect(page.locator('#loaded')).toHaveText('loaded');
  expect(asked.length).toBeGreaterThan(1);
  expect(asked).toContain('/dist/esm/index.js');
  expect(asked).toContain('/dist/esm/toast.js');
});

test('messages shown while the module loads keep their order', async ({
  page,
}) => {
  await open(page);
  await page.locator('#three').dispatchEvent('click');
  await expect(page.locator('.mm-notify p')).toHaveText([
    'Third, 5 s.',
    'Second, 5 s.',
    'First, 5 s.',
  ]);
});
