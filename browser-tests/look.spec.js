/**
 * Screenshots to look at by eye (`test-results/look/<browser>-<what>.png`). No pixel
 * comparison: fonts differ per engine. What can be asserted is the order on screen.
 */
import { expect } from '@playwright/test';
import { MULTI_LINE, open, POSITIONS, test } from './helpers.js';

const STACK = [
  ['Your changes are saved.', 'success'],
  ['That did not work. Please try again.', 'error'],
  [MULTI_LINE, 'neutral'],
  ['Your session ends in five minutes.', 'alert'],
  ['A new version is available.', 'neutral'],
];

for (const { name, attribute, sign } of POSITIONS) {
  test(`the stack, ${name}`, async ({ page, problems }, testInfo) => {
    // A screenshot in WebKit adds `<style>body {}</style>` of Playwright's own, whatever the
    // options, and the CSP refuses it. Seen with the package not loaded at all, and never
    // without a screenshot. page.spec.js checks that the package adds no <style>.
    if (testInfo.project.name === 'webkit')
      problems.provoked.push(
        /Refused to apply a stylesheet|style-src-elem: inline/
      );
    await open(page, { position: attribute });
    await page.evaluate(async (stack) => {
      for (const [text, kind] of stack)
        await window.t.toast(text, kind, { timeoutMs: 0 });
    }, STACK);
    await expect(page.locator('.mm-notify')).toHaveCount(5);
    const tops = await page.evaluate((stack) => {
      window.t.settle();
      return stack.map(([text]) => window.t.boxOf(text).top);
    }, STACK);
    // The newest at the start of the stack: on top, or at the bottom.
    const sorted = [...tops].sort((a, b) => sign * (a - b));
    expect(tops).toEqual(sorted);

    // With the button's own transition over, in real time.
    await page.waitForTimeout(100);
    await page.screenshot({
      path: `test-results/look/${testInfo.project.name}-${name}.png`,
    });
  });
}

/** The colors in a screenshot of an element: down its middle, in CSS px from its top. */
async function pixelsDown(page, buffer, offsets) {
  const blank = await page.context().newPage();
  const colors = await blank.evaluate(
    async ([src, rows]) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      // Top of the box only: the text starts below these rows at any scale.
      const x = Math.round(image.width / 2);
      const scale = image.height / rows.height;
      return rows.at.map((row) => [
        ...context.getImageData(x, Math.round(row * scale), 1, 1).data,
      ]);
    },
    [`data:image/png;base64,${buffer.toString('base64')}`, offsets]
  );
  await blank.close();
  return colors;
}

for (const { name, attribute } of POSITIONS) {
  // The lower message paints over the glow of the upper. `column-reverse` shows the DOM's
  // order upside down, so the bottom positions need the z-index from toast.ts. Without it:
  // Firefox 159 rgb(204, 85, 70) and WebKit 27.2 rgb(201, 88, 70) on an error's top edge,
  // instead of the flat rgb(239, 64, 60). Chromium's engines didn't show it either way.
  test(`${name}: a message's color isn't tinted by the glow of the next`, async ({
    page,
    problems,
    browserName,
  }) => {
    if (browserName === 'webkit')
      problems.provoked.push(
        /Refused to apply a stylesheet|style-src-elem: inline/
      );
    await open(page, { position: attribute });
    await page.evaluate(async () => {
      await window.t.toast('Below or above.', 'error', { timeoutMs: 0 });
      await window.t.toast('Other.', 'alert', { timeoutMs: 0 });
    });
    await expect(page.locator('.mm-notify')).toHaveCount(2);
    await page.evaluate(async () => {
      await window.t.toast('Saved.', 'success', { timeoutMs: 0 });
    });
    await expect(page.locator('.mm-notify')).toHaveCount(3);
    await page.evaluate(() => {
      window.t.settle();
    });
    const item = page.locator('.mm-notify-alert');
    const { height } = await item.boundingBox();
    const buffer = await item.screenshot();
    const colors = await pixelsDown(page, buffer, {
      height,
      at: [1, 4, 8],
    });
    for (const [red, green, blue] of colors) {
      expect(Math.abs(red - 255)).toBeLessThanOrEqual(6);
      expect(Math.abs(green - 213)).toBeLessThanOrEqual(6);
      expect(Math.abs(blue - 86)).toBeLessThanOrEqual(6);
    }
  });
}
