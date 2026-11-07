/**
 * The shared test setup. Every test fails on a console error, an uncaught error or a
 * CSP violation, whatever it set out to check.
 */
import { fileURLToPath } from 'node:url';
import { expect, test as base } from '@playwright/test';

const inPage = fileURLToPath(new URL('./in-page.js', import.meta.url));

export const PAGE = '/examples/';

/** The positions, set the way a site does it: tokens on `:root`, here through page.css. */
export const POSITIONS = [
  { name: 'top', attribute: '', sign: -1 },
  { name: 'bottom', attribute: 'bottom-left', sign: 1 },
];

export const ONE_LINE = 'One line.';
export const MULTI_LINE =
  'A longer message that takes several lines, to see that a closing or growing message of more than one line moves its neighbour by exactly what it loses, no more and no less, in this position.';

export const test = base.extend({
  problems: [
    async ({ page }, use) => {
      const problems = [];
      /** What a test provokes on purpose, to show that the policy bites. */
      problems.provoked = [];
      page.on('console', (message) => {
        // The example page has no icon, and full browsers ask for one: nothing of the package.
        if (message.location().url.endsWith('/favicon.ico')) return;
        if (message.type() === 'error')
          problems.push(`${message.text()} (${message.location().url})`);
      });
      page.on('pageerror', (error) => {
        problems.push(`uncaught: ${error.message}`);
      });
      await page.addInitScript(() => {
        window.violations = [];
        document.addEventListener('securitypolicyviolation', (event) => {
          window.violations.push(
            `${event.effectiveDirective}: ${event.blockedURI}`
          );
        });
      });
      await page.addInitScript({ path: inPage });
      await use(problems);
      const violations =
        page.isClosed() ?
          []
        : await page.evaluate(() => window.violations).catch(() => []);
      expect(
        [...problems, ...violations].filter(
          (problem) => !problems.provoked.some((known) => known.test(problem))
        )
      ).toEqual([]);
    },
    { auto: true },
  ],
});

/** Opens the page with the clock in the test's hands: no timer or frame runs unless told. */
export async function openPaused(page, { position = '', search = '' } = {}) {
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.goto(PAGE + search);
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'));
  await page.mouse.move(1, 1);
  await setPosition(page, position);
  await page.evaluate(() => {
    window.t.holdArrivals();
  });
}

/** Opens the page in real time. */
export async function open(page, { position = '', search = '' } = {}) {
  await page.goto(PAGE + search);
  await page.mouse.move(1, 1);
  await setPosition(page, position);
}

export async function setPosition(page, position) {
  await page.evaluate((value) => {
    document.documentElement.dataset.position = value;
  }, position);
}

/** Shows the messages in this order, as permanent ones unless told, and runs their frame. */
export async function show(page, texts, options = { timeoutMs: 0 }) {
  await page.evaluate(
    async ([all, opts]) => {
      for (const text of all) await window.t.toast(text, 'neutral', opts);
    },
    [texts, options]
  );
  await page.clock.runFor(20);
}

/** Shows them and ends their growth. */
export async function showAtRest(page, texts, options) {
  await show(page, texts, options);
  await page.evaluate(() => {
    window.t.settle();
  });
}

/** Clicks the cross from script (a real pointer would hover and hold it) and holds the closing. */
export const closeHeld = (page, text) =>
  page.evaluate((message) => window.t.closeHeld(message), text);

export const close = (actual, expected, tolerance, label) => {
  expect(
    Math.abs(actual - expected),
    `${label}: ${actual} against ${expected}`
  ).toBeLessThanOrEqual(tolerance);
};
