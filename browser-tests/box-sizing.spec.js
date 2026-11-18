/**
 * A site with `box-sizing: border-box` on everything (a common reset): the growth
 * must not jump. Before the fix the box eased to its height without the padding, the
 * text cut off, then snapped to its full height and moved the stack.
 */
import { expect } from '@playwright/test';
import {
  close,
  closeHeld,
  MULTI_LINE,
  ONE_LINE,
  openPaused,
  POSITIONS,
  show,
  showAtRest,
  test,
} from './helpers.js';

const GROWTH_STEPS = [0, 30, 60, 100, 150, 200, 300, 400, 500, 599];
const CLOSING_STEPS = [0, 30, 60, 100, 150, 200, 250, 299];

/** What a site's reset does: added after the package's sheet, as a page's own CSS. */
const borderBox = (page) =>
  page.evaluate(() => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync('*, *::before, *::after { box-sizing: border-box; }');
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  });

const sample = (page, text, neighbour, ms) =>
  page.evaluate(
    ([target, other, time]) => {
      const { t } = window;
      const item = t.item(target);
      if (time !== null) t.step(item, time);
      return { item: t.box(item), neighbour: t.box(t.item(other)) };
    },
    [text, neighbour, ms]
  );

const taken = ({ height, marginBottom }) => height + marginBottom;

test.describe('a site with box-sizing: border-box on everything', () => {
  for (const { name, attribute, sign } of POSITIONS) {
    for (const [lines, text] of [
      ['one line', ONE_LINE],
      ['multi-line', MULTI_LINE],
    ]) {
      test(`${name}, ${lines}: grows to its full height with no snap at the end`, async ({
        page,
      }) => {
        await openPaused(page, { position: attribute });
        await showAtRest(page, ['Older.']);
        await borderBox(page);

        await show(page, [text]);
        const first = await sample(page, text, 'Older.', 0);
        expect(first.item.height).toBeLessThan(1);
        let previous = first;
        for (const ms of GROWTH_STEPS) {
          const now = await sample(page, text, 'Older.', ms);
          expect(now.item.height, `${ms} ms`).toBeGreaterThanOrEqual(
            previous.item.height - 0.01
          );
          // The neighbour moves by exactly what the message takes, all the way.
          close(
            now.neighbour.top,
            first.neighbour.top - sign * (taken(now.item) - taken(first.item)),
            0.25,
            `neighbour at ${ms} ms`
          );
          previous = now;
        }
        const end = previous;
        await page.evaluate(() => {
          window.t.settle();
        });
        const rest = await sample(page, text, 'Older.', null);
        // At 599 ms it is (almost) where it rests: before, it was the height without
        // the padding, 28 px short, and snapped to the rest at the end.
        close(
          end.item.height,
          rest.item.height,
          1,
          'height at 599 ms and at rest'
        );
        close(end.neighbour.top, rest.neighbour.top, 1, 'neighbour');
        // And the text isn't cut: the box holds all of it.
        const fits = await page.evaluate((target) => {
          const item = window.t.item(target);
          return item.scrollHeight <= item.clientHeight + 1;
        }, text);
        expect(fits).toBe(true);
        // The cause, fixed in the package's CSS.
        expect(
          await page.evaluate(
            () =>
              getComputedStyle(document.querySelector('.mm-notify')).boxSizing
          )
        ).toBe('content-box');
      });

      test(`${name}, ${lines}: shrinks from its full height on closing, the neighbour following`, async ({
        page,
      }) => {
        await openPaused(page, { position: attribute });
        await borderBox(page);
        await showAtRest(page, ['Older.', text]);
        const rest = await sample(page, text, 'Older.', null);
        await closeHeld(page, text);
        let previous = rest;
        for (const ms of CLOSING_STEPS) {
          const now = await sample(page, text, 'Older.', ms);
          if (ms === 0)
            close(
              now.item.height,
              rest.item.height,
              0.5,
              'no jump at the start'
            );
          expect(now.item.height, `${ms} ms`).toBeLessThanOrEqual(
            previous.item.height + 0.01
          );
          close(
            now.neighbour.top,
            rest.neighbour.top + sign * (taken(rest.item) - taken(now.item)),
            0.25,
            `neighbour at ${ms} ms`
          );
          previous = now;
        }
        expect(previous.item.height).toBeLessThan(1);
      });
    }
  }
});
