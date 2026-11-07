/**
 * Growth and the closing, stepped through the real animations (Web Animations API),
 * with the clock paused so that the removal waits for the test. Tolerance 0.25 px:
 * layout rounds to 1/60 or 1/64 px per value, a few values are added up.
 */
import { expect } from '@playwright/test';
import {
  close,
  closeHeld,
  MULTI_LINE,
  ONE_LINE,
  open,
  openPaused,
  POSITIONS,
  setPosition,
  show,
  showAtRest,
  test,
} from './helpers.js';

const TOLERANCE = 0.25;
const CLOSING_STEPS = [0, 30, 60, 100, 150, 200, 250, 280, 299, 300];
const GROWTH_STEPS = [0, 30, 60, 100, 150, 200, 300, 400, 500, 599, 600];

const sample = (page, target, neighbour, stay, ms) =>
  page.evaluate(
    ([targetText, neighbourText, stayText, time]) => {
      const { t } = window;
      const item = t.item(targetText);
      t.step(item, time);
      return {
        item: t.box(item),
        neighbour: t.box(t.item(neighbourText)),
        stay: t.box(t.item(stayText)),
        clear: t.box(t.clearAll()),
        children: [...item.children].map(
          (child) => +getComputedStyle(child).opacity
        ),
      };
    },
    [target, neighbour, stay, ms]
  );

/** What a closing or growing message takes in the stack: its box and its margin. */
const taken = ({ height, marginBottom }) => height + marginBottom;

for (const { name, attribute, sign } of POSITIONS) {
  for (const [lines, text] of [
    ['one line', ONE_LINE],
    ['multi-line', MULTI_LINE],
  ]) {
    test(`${name}, ${lines}, in the middle: closes on one curve and the neighbour follows`, async ({
      page,
    }) => {
      await openPaused(page, { position: attribute });
      // Oldest first; in the DOM the newest comes first, so `Older` is what moves.
      await showAtRest(page, ['Older.', text, 'Newer.', 'Newest.']);
      const held = await closeHeld(page, text);

      // The right things animate, for the right time.
      const onBox = held.filter(({ target }) => target === 'div');
      expect(onBox.map(({ name: n }) => n)).toEqual(
        expect.arrayContaining([
          'max-height',
          'padding-top',
          'padding-bottom',
          'margin-bottom',
          'opacity',
        ])
      );
      for (const { duration } of onBox) expect(duration).toBe(300);
      const onChildren = held.filter(({ target }) => target !== 'div');
      expect(onChildren.map(({ name: n }) => n)).toEqual([
        'opacity',
        'opacity',
        'opacity',
      ]);
      for (const { duration } of onChildren) expect(duration).toBe(100);

      const first = await sample(page, text, 'Older.', 'Newer.', 0);
      expect(first.item.content).toBeGreaterThan(0);
      expect(first.item.marginBottom).toBe(10);
      expect(first.item.paddingTop).toBe(14);
      if (text === MULTI_LINE)
        expect(first.item.content).toBeGreaterThan(2 * 22);

      let previous = first;
      for (const ms of CLOSING_STEPS) {
        const now = await sample(page, text, 'Older.', 'Newer.', ms);
        const label = `${ms} ms`;

        // Height, padding and margin are the same share of where they began.
        const share = now.item.content / first.item.content;
        close(
          now.item.paddingTop / first.item.paddingTop,
          share,
          0.02,
          `padding at ${label}`
        );
        close(
          now.item.marginBottom / first.item.marginBottom,
          share,
          0.02,
          `margin at ${label}`
        );

        // The neighbour moves exactly what the message has lost, so does clear all.
        const lost = taken(first.item) - taken(now.item);
        close(
          now.neighbour.top,
          first.neighbour.top + sign * lost,
          TOLERANCE,
          `neighbour at ${label}`
        );
        close(
          now.clear.top,
          first.clear.top + sign * lost,
          TOLERANCE,
          `clear all at ${label}`
        );
        // What comes after it in the flow doesn't move.
        close(now.stay.top, first.stay.top, TOLERANCE, `the other at ${label}`);

        expect(now.item.content).toBeLessThanOrEqual(previous.item.content);
        previous = now;

        if (ms === 60) {
          for (const opacity of now.children) {
            expect(opacity).toBeGreaterThan(0);
            expect(opacity).toBeLessThan(1);
          }
          expect(now.item.opacity).toBeGreaterThan(0.5);
        }
        if (ms >= 100) expect(now.children).toEqual([0, 0, 0]);
        if (ms === 100) expect(now.item.opacity).toBeGreaterThan(0.5);
        if (ms === 280) expect(now.item.height).toBeGreaterThan(0);
        if (ms === 299) {
          expect(now.item.height).toBeLessThan(1);
          expect(now.item.opacity).toBeLessThan(0.05);
        }
      }

      // All at nothing together at 300.
      expect(previous.item.content).toBe(0);
      expect(previous.item.height).toBe(0);
      expect(previous.item.paddingTop).toBe(0);
      expect(previous.item.paddingBottom).toBe(0);
      expect(previous.item.marginBottom).toBe(0);
      expect(previous.item.opacity).toBe(0);
      close(
        previous.neighbour.top,
        first.neighbour.top + sign * taken(first.item),
        TOLERANCE,
        'the whole way'
      );

      // Still there just before its time, and no jump when it goes.
      await page.clock.runFor(340);
      expect(await page.evaluate((m) => !!window.t.item(m), text)).toBe(true);
      await page.clock.runFor(20);
      const after = await page.evaluate(
        ([m, n]) => ({
          gone: !window.t.item(m),
          neighbour: window.t.box(window.t.item(n)),
          clear: window.t.box(window.t.clearAll()),
        }),
        [text, 'Older.']
      );
      expect(after.gone).toBe(true);
      close(
        after.neighbour.top,
        previous.neighbour.top,
        0.02,
        'neighbour at removal'
      );
      close(after.clear.top, previous.clear.top, 0.02, 'clear all at removal');
    });

    test(`${name}, ${lines}: grows from nothing and the neighbour moves in step`, async ({
      page,
    }) => {
      await openPaused(page, { position: attribute });
      await showAtRest(page, ['Older.', 'Old.', 'Other.']);
      const rest = await page.evaluate(() => ({
        neighbour: window.t.boxOf('Other.'),
        clear: window.t.box(window.t.clearAll()),
      }));

      await show(page, [text]);
      const held = await page.evaluate(
        (message) => window.t.hold(window.t.item(message)),
        text
      );
      // On its first frame: holdArrivals has it.
      expect(held).toEqual([
        { name: 'mm-notify-in', duration: 600, target: 'div' },
      ]);

      let previousHeight = -1;
      for (const ms of GROWTH_STEPS) {
        const now = await sample(page, text, 'Other.', 'Older.', ms);
        const label = `${ms} ms`;
        if (ms === 0) {
          expect(now.item.height).toBe(0);
          expect(now.item.marginBottom).toBe(0);
          expect(now.item.opacity).toBe(0);
        }
        expect(now.item.height).toBeGreaterThanOrEqual(previousHeight);
        previousHeight = now.item.height;
        // Pushes the neighbour by its whole share, sign opposite to a closing.
        close(
          now.neighbour.top,
          rest.neighbour.top - sign * taken(now.item),
          TOLERANCE,
          `neighbour at ${label}`
        );
        close(
          now.clear.top,
          rest.clear.top - sign * taken(now.item),
          TOLERANCE,
          `clear all at ${label}`
        );
      }

      // The end of the animation is the box at rest: nothing jumps when it ends.
      const end = await sample(page, text, 'Other.', 'Older.', 599.9);
      const atRest = await page.evaluate(
        ([m, n]) => {
          const item = window.t.item(m);
          const target = item.style.getPropertyValue('--mm-notify-height');
          window.t.settle();
          return {
            target: parseFloat(target),
            item: window.t.box(item),
            neighbour: window.t.boxOf(n),
          };
        },
        [text, 'Other.']
      );
      close(atRest.item.height, end.item.height, 0.5, 'height at the end');
      close(atRest.neighbour.top, end.neighbour.top, 0.5, 'neighbour at end');
      // What it grows to: read while the padding is 0, or it would be 28 px more. For one
      // line it is 26, not the 22.4 of the text: the cross's 32 px hang out of the flow by
      // its negative margins, and scrollHeight counts that. Harmless, see the plan's log.
      expect(atRest.target).toBeGreaterThanOrEqual(atRest.item.content - 0.5);
      expect(atRest.target).toBeLessThanOrEqual(
        Math.max(atRest.item.content, 26) + 0.5
      );
    });

    test(`${name}, ${lines}: closed while still growing, it goes on from where it is`, async ({
      page,
    }) => {
      await openPaused(page, { position: attribute });
      await showAtRest(page, ['Older.', 'Old.', 'Other.']);
      const rest = await page.evaluate(() => window.t.boxOf('Other.'));
      await show(page, [text]);
      const growing = await sample(page, text, 'Other.', 'Older.', 200);
      expect(growing.item.height).toBeGreaterThan(5);

      const held = await closeHeld(page, text);
      expect(held.map(({ name: n }) => n)).not.toContain('mm-notify-in');
      expect(held.map(({ name: n }) => n)).toContain('max-height');

      const first = await sample(page, text, 'Other.', 'Older.', 0);
      close(first.item.height, growing.item.height, 0.5, 'height at the start');
      close(
        first.neighbour.top,
        growing.neighbour.top,
        0.5,
        'neighbour at the start'
      );
      close(first.item.opacity, growing.item.opacity, 0.02, 'opacity at start');

      let previous = first;
      for (const ms of CLOSING_STEPS) {
        const now = await sample(page, text, 'Other.', 'Older.', ms);
        expect(now.item.height).toBeLessThanOrEqual(previous.item.height);
        close(
          now.neighbour.top,
          rest.top - sign * taken(now.item),
          TOLERANCE,
          `neighbour at ${ms} ms`
        );
        previous = now;
      }
      expect(previous.item.height).toBe(0);
      expect(previous.item.marginBottom).toBe(0);
      close(previous.neighbour.top, rest.top, TOLERANCE, 'back where it was');

      await page.clock.runFor(360);
      const after = await page.evaluate(
        ([m, n]) => ({
          gone: !window.t.item(m),
          neighbour: window.t.boxOf(n),
        }),
        [text, 'Other.']
      );
      expect(after.gone).toBe(true);
      close(after.neighbour.top, rest.top, TOLERANCE, 'neighbour at removal');
    });
  }

  test(`${name}: in real time, no jump at the removal`, async ({
    page,
  }, testInfo) => {
    await open(page, { position: attribute });
    await page.evaluate(async () => {
      for (const text of ['Older.', 'Middle.', 'Newer.', 'Newest.'])
        await window.t.toast(text, 'neutral', { timeoutMs: 0 });
    });
    await expect(page.locator('.mm-notify')).toHaveCount(4);
    const { jump, frames } = await page.evaluate(() => {
      window.t.settle();
      return window.t.closeAndWatchRemoval('Middle.', 'Older.');
    });
    // One direction only.
    const moved = frames.slice(1).map((f, i) => f.top - frames[i].top);
    for (const d of moved) expect(sign * d).toBeGreaterThanOrEqual(-0.01);

    // Frames on time: several steps, and nothing left. WebKit here skips frames (gaps of 70 to 300 ms, with
    // Chromium at 16 ms in the same run), and a loaded machine may too. Then the removal can
    // cut the transition short: a known artifact of the fixed timer, left on the user's
    // decision (plan §7 N10), so this only keeps a record of it.
    const gaps = frames.slice(1).map((f, i) => f.at - frames[i].at);
    const worst = Math.max(...gaps);
    testInfo.annotations.push({
      type: 'removal',
      description: `jump ${jump.toFixed(2)} px, worst frame gap ${Math.round(worst)} ms`,
    });
    if (worst < 60) {
      expect(moved.filter((d) => Math.abs(d) > 0.01).length).toBeGreaterThan(3);
      expect(jump).toBeLessThanOrEqual(0.5);
    }
  });
}

test('position changes after messages exist are only CSS', async ({ page }) => {
  await openPaused(page);
  await showAtRest(page, ['Older.', 'Newer.']);
  const inTop = await page.evaluate(() => [
    window.t.boxOf('Newer.').top,
    window.t.boxOf('Older.').top,
  ]);
  expect(inTop[0]).toBeLessThan(inTop[1]);
  await setPosition(page, 'bottom-left');
  const inBottom = await page.evaluate(() => [
    window.t.boxOf('Newer.').top,
    window.t.boxOf('Older.').top,
  ]);
  expect(inBottom[0]).toBeGreaterThan(inBottom[1]);
});
