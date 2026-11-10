/**
 * A stack taller than its room (D43): at most 2/3 of the window, clear all included,
 * the messages scrolling inside with faded edges where more is beyond, clear all at
 * the end and on screen. Keyboard, wheel, a new message while scrolled, the fade's
 * pixels and its timing. Under a header like aesweets' (4.25rem, 68 px) at the top.
 */
import { expect } from '@playwright/test';
import { close, MULTI_LINE, open, POSITIONS, test } from './helpers.js';

const HEADER = '4.25rem';
const VIEWPORT = { width: 800, height: 420 };
/** `--notify-fade` (2rem) and the list's padding (1.25rem above, 1.5rem below). */
const FADE = 32;
const PAD = { above: 20, below: 24 };

const tokens = (page, values) =>
  page.evaluate((all) => {
    for (const [name, value] of Object.entries(all))
      document.documentElement.style.setProperty(name, value);
  }, values);

/** Shows permanent messages, one per call, in real time, and waits for them. */
const add = async (page, from, to, kind = 'neutral') => {
  await page.evaluate(
    async ([a, b, k]) => {
      for (let n = a; n <= b; n += 1)
        await window.t.toast(`Message ${n}.`, k, { timeoutMs: 0 });
    },
    [from, to, kind]
  );
  await expect(page.locator('.mm-notify')).toHaveCount(to);
  // Ends the growth, and clear all's slide and its z-index; then two frames for the
  // ResizeObserver that sets the fades.
  await page.evaluate(async () => {
    window.t.settle();
    for (let n = 0; n < 2; n += 1)
      await new Promise((resolve) => requestAnimationFrame(resolve));
  });
};

/**
 * The page didn't scroll along. Only where the browser has overscroll-behavior: not in
 * Safari before 16 (one of aesweets' targets) nor in Playwright's WebKit for Windows,
 * where the wheel goes on to the page at the list's end.
 */
async function pageStayed(page, testInfo) {
  const contained = await page.evaluate(() =>
    CSS.supports('overscroll-behavior: contain')
  );
  const { scrollY } = await state(page);
  if (contained) expect(scrollY).toBe(0);
  else
    testInfo.annotations.push({
      type: 'no overscroll-behavior',
      description: `the page scrolled to ${scrollY}`,
    });
}

const state = (page) =>
  page.evaluate(() => {
    const { t } = window;
    const list = document.querySelector('.mm-notify-list');
    const region = document.querySelector('.mm-notify-region');
    const button = t.clearAll();
    const box = button.getBoundingClientRect();
    const rect = (element) => {
      const r = element.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom };
    };
    const items = [...document.querySelectorAll('.mm-notify')];
    return {
      innerHeight,
      scrollY,
      region: region.getBoundingClientRect().height,
      list: rect(list),
      scrollTop: list.scrollTop,
      scrollable: list.scrollHeight > list.clientHeight + 1,
      above: list.classList.contains('mm-notify-above'),
      below: list.classList.contains('mm-notify-below'),
      button: rect(button),
      visible: getComputedStyle(button).visibility === 'visible',
      hit: t.hits(
        button,
        (box.left + box.right) / 2,
        (box.top + box.bottom) / 2
      ),
      // The newest is the first in the DOM.
      newest: items[0] && rect(items[0]),
      oldest: items.length > 0 && rect(items[items.length - 1]),
    };
  });

for (const { name, attribute, sign } of POSITIONS) {
  for (const search of ['', '?no-popover']) {
    const label = `${name}${search && ', without popover'}`;
    test.describe(`a stack taller than its room, ${label}`, () => {
      test.beforeEach(async ({ page }) => {
        await page.setViewportSize(VIEWPORT);
        await open(page, { position: attribute, search });
        if (sign < 0) await tokens(page, { '--notify-top': HEADER });
      });

      test('fits: no fade, no scrolling, the button after the messages', async ({
        page,
      }) => {
        await add(page, 1, 3);
        await expect.poll(async () => (await state(page)).visible).toBe(true);
        const seen = await state(page);
        expect(seen).toMatchObject({
          scrollable: false,
          above: false,
          below: false,
        });
        if (sign < 0) {
          close(seen.newest.top, 68, 0.5, 'under the header');
          close(seen.button.top, seen.oldest.bottom + 10, 0.5, 'after them');
        } else {
          close(seen.newest.bottom, seen.innerHeight - 34, 0.5, 'room below');
          close(seen.button.bottom, seen.oldest.top - 10, 0.5, 'above them');
        }
      });

      test('at most 2/3 of the window; the messages scroll, the button stays on screen', async ({
        page,
      }) => {
        await add(page, 1, 12);
        const seen = await state(page);
        expect(seen.region).toBeLessThanOrEqual((seen.innerHeight * 2) / 3 + 1);
        expect(seen.scrollable).toBe(true);
        expect(seen.visible).toBe(true);
        expect(seen.hit).toBe(true);
        expect(seen.button.top).toBeGreaterThanOrEqual(0);
        expect(seen.button.bottom).toBeLessThanOrEqual(seen.innerHeight);
        // At the start: only the far edge has messages beyond it (from the frame after).
        await expect
          .poll(async () => {
            const now = await state(page);
            return { above: now.above, below: now.below };
          })
          .toEqual(
            sign < 0 ?
              { above: false, below: true }
            : { above: true, below: false }
          );
        // The newest in full sight, where the stack starts.
        if (sign < 0)
          close(seen.newest.top, 68, 0.5, 'newest under the header');
        else close(seen.newest.bottom, seen.innerHeight - 34, 0.5, 'newest');
      });

      test('follows the window: a taller one fits, a shorter one scrolls', async ({
        page,
      }) => {
        await add(page, 1, 6);
        await expect
          .poll(async () => (await state(page)).scrollable)
          .toBe(true);
        await page.setViewportSize({ width: 800, height: 900 });
        await expect
          .poll(async () => {
            const seen = await state(page);
            return [seen.scrollable, seen.above, seen.below];
          })
          .toEqual([false, false, false]);
        await page.setViewportSize(VIEWPORT);
        await expect
          .poll(async () => (await state(page)).scrollable)
          .toBe(true);
      });
    });
  }

  test.describe(`scrolling, ${name}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize(VIEWPORT);
      await open(page, { position: attribute });
      if (sign < 0) await tokens(page, { '--notify-top': HEADER });
    });

    test('the wheel scrolls the list, never the page, and the fades follow', async ({
      page,
    }, testInfo) => {
      await add(page, 1, 12);
      const point = await page.evaluate(() => {
        const r = window.t.item('Message 11.').getBoundingClientRect();
        return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
      });
      await page.mouse.move(point.x, point.y);
      // A notch can be lost right after layout changed (seen once in Edge): turn again.
      let notches = 0;
      await expect(async () => {
        notches += 1;
        await page.mouse.wheel(0, sign * -150);
        await expect
          .poll(async () => Math.abs((await state(page)).scrollTop), {
            timeout: 1_500,
          })
          .toBeGreaterThan(50);
      }).toPass({ timeout: 10_000 });
      testInfo.annotations.push({ type: 'wheel', description: `${notches}` });
      await expect
        .poll(async () => {
          const seen = await state(page);
          return [seen.above, seen.below];
        })
        .toEqual([true, true]);

      // Far past the end: the list stops there, the page stays (overscroll contain).
      for (let n = 0; n < 4; n += 1) await page.mouse.wheel(0, sign * -1500);
      await expect
        .poll(async () => {
          const seen = await state(page);
          return [seen.above, seen.below];
        })
        .toEqual(sign < 0 ? [true, false] : [false, true]);
      await page.waitForTimeout(300);
      await pageStayed(page, testInfo);
    });

    test('the wheel over the gap between two messages scrolls the list too', async ({
      page,
    }, testInfo) => {
      await add(page, 1, 12);
      const point = await page.evaluate(() => {
        const a = window.t.item('Message 12.').getBoundingClientRect();
        const b = window.t.item('Message 11.').getBoundingClientRect();
        const y =
          a.top < b.top ? (a.bottom + b.top) / 2 : (b.bottom + a.top) / 2;
        return { x: (a.left + a.right) / 2, y };
      });
      expect(
        await page.evaluate(
          ({ x, y }) => document.elementFromPoint(x, y)?.className,
          point
        )
      ).toContain('mm-notify-list');
      await page.mouse.move(point.x, point.y);
      await expect(async () => {
        await page.mouse.wheel(0, sign * -150);
        await expect
          .poll(async () => Math.abs((await state(page)).scrollTop), {
            timeout: 1_500,
          })
          .toBeGreaterThan(50);
      }).toPass({ timeout: 10_000 });
      await pageStayed(page, testInfo);
    });

    // Plan §7 N20, a trade-off kept: the list's box reaches past the messages (its
    // padding, room for the glow and the slide-in), so while it scrolls and takes the
    // pointer (the wheel test above) a band around the messages does too: under a sticky
    // header like aesweets', 20 px of the header. Letting the pointer through instead made
    // the wheel fall through a gap to the page in Chromium and WebKit (review of scroll-stack).
    test('at rest the page around and between the messages takes the pointer; while it scrolls, the list box does', async ({
      page,
    }) => {
      const points = () =>
        page.evaluate(() => {
          const list = document.querySelector('.mm-notify-list');
          const l = list.getBoundingClientRect();
          const items = [...document.querySelectorAll('.mm-notify')];
          // The newest is the first in the DOM; its neighbour is the second.
          const [a, b] = items.map((item) => item.getBoundingClientRect());
          const x = (a.left + a.right) / 2;
          const y = (a.top + a.bottom) / 2;
          const named = {
            gap: [
              x,
              a.top < b.top ? (a.bottom + b.top) / 2 : (b.bottom + a.top) / 2,
            ],
            beyondNewest: [x, a.top < b.top ? a.top - 10 : a.bottom + 10],
            leftOfIt: [a.left - 8, y],
            rightOfIt: [a.right + 8, y],
          };
          const region = document.querySelector('.mm-notify-region');
          return Object.fromEntries(
            Object.entries(named).map(([name, [px, py]]) => {
              const hit = document.elementFromPoint(px, py);
              return [
                name,
                {
                  inListBox:
                    px > l.left && px < l.right && py > l.top && py < l.bottom,
                  onStack: Boolean(hit && region.contains(hit)),
                },
              ];
            })
          );
        });
      await add(page, 1, 3);
      for (const [name, seen] of Object.entries(await points()))
        expect(seen, `fits, ${name}`).toEqual({
          inListBox: true,
          onStack: false,
        });
      await add(page, 4, 12);
      expect((await state(page)).scrollable).toBe(true);
      for (const [name, seen] of Object.entries(await points()))
        expect(seen, `scrolls, ${name}`).toEqual({
          inListBox: true,
          onStack: true,
        });
    });

    test('a new message while the pointer is on the list: no jump, its message stays under it', async ({
      page,
    }) => {
      await add(page, 1, 12);
      const point = await page.evaluate((s) => {
        const list = document.querySelector('.mm-notify-list');
        list.scrollTop = s * -200;
        const l = list.getBoundingClientRect();
        const x = (l.left + l.right) / 2;
        const middle = (l.top + l.bottom) / 2;
        const item = document.elementFromPoint(x, middle).closest('.mm-notify');
        const r = item.getBoundingClientRect();
        return {
          x,
          y: (r.top + r.bottom) / 2,
          text: item.querySelector('p').textContent,
        };
      }, sign);
      await page.mouse.move(point.x, point.y);
      await page.evaluate(() =>
        window.t.toast('The newest.', 'success', { timeoutMs: 0 })
      );
      await expect(page.locator('.mm-notify')).toHaveCount(13);
      await page.evaluate(async () => {
        window.t.settleMessages();
        for (let n = 0; n < 2; n += 1)
          await new Promise((resolve) => requestAnimationFrame(resolve));
      });
      const seen = await page.evaluate(
        ({ x, y }) => ({
          scrollTop: document.querySelector('.mm-notify-list').scrollTop,
          under: document
            .elementFromPoint(x, y)
            ?.closest('.mm-notify')
            ?.querySelector('p').textContent,
        }),
        point
      );
      expect(seen.scrollTop).not.toBe(0);
      expect(seen.under).toBe(point.text);
    });

    test('a new message while scrolled: back at the start, the new one in sight', async ({
      page,
    }) => {
      await add(page, 1, 12);
      await page.evaluate((s) => {
        document.querySelector('.mm-notify-list').scrollTop = s * -200;
      }, sign);
      await page.evaluate(() =>
        window.t.toast('The newest.', 'success', { timeoutMs: 0 })
      );
      await expect(page.locator('.mm-notify')).toHaveCount(13);
      await page.evaluate(() => {
        window.t.settleMessages();
      });
      await expect.poll(async () => (await state(page)).scrollTop).toBe(0);
      const seen = await page.evaluate(() => {
        const r = window.t.item('The newest.').getBoundingClientRect();
        const l = document
          .querySelector('.mm-notify-list')
          .getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, list: [l.top, l.bottom] };
      });
      expect(seen.top).toBeGreaterThanOrEqual(seen.list[0]);
      expect(seen.bottom).toBeLessThanOrEqual(seen.list[1]);
    });

    test('a new message while the keyboard is in the list: the focused cross stays in sight', async ({
      page,
    }) => {
      await add(page, 1, 12);
      const cross = page
        .locator('.mm-notify', { hasText: 'Message 6.' })
        .locator('.mm-notify-close');
      await cross.focus();
      await page.evaluate(() =>
        window.t.toast('The newest.', 'success', { timeoutMs: 0 })
      );
      await expect(page.locator('.mm-notify')).toHaveCount(13);
      await page.evaluate(() => {
        window.t.settleMessages();
      });
      await page.waitForTimeout(200);
      await expect(cross).toBeFocused();
      const seen = await page.evaluate(() => {
        const c = document.activeElement.getBoundingClientRect();
        const l = document
          .querySelector('.mm-notify-list')
          .getBoundingClientRect();
        return { top: c.top, bottom: c.bottom, list: [l.top, l.bottom] };
      });
      expect(seen.top).toBeGreaterThanOrEqual(seen.list[0]);
      expect(seen.bottom).toBeLessThanOrEqual(seen.list[1]);
    });

    // Plan §7 N12 / aesweets D43: 12 messages in a 420 px window, Tab through all.
    test('Tab brings every cross fully into sight, out of the fades and from under clear all', async ({
      page,
    }) => {
      await add(page, 1, 12);
      await page.locator('.mm-notify-close').first().focus();
      const seen = [];
      for (let n = 0; n < 12; n += 1) {
        if (n > 0) await page.keyboard.press('Tab');
        // Let a smooth focus scroll and a fade transition end.
        await page.waitForTimeout(350);
        seen.push(
          await page.evaluate(
            ([fade, pad]) => {
              const focused = document.activeElement;
              const list = document.querySelector('.mm-notify-list');
              const button = window.t.clearAll();
              const c = focused.getBoundingClientRect();
              const l = list.getBoundingClientRect();
              const b = button.getBoundingClientRect();
              const top =
                l.top +
                (list.classList.contains('mm-notify-above') ?
                  pad.above + fade
                : 0);
              const bottom =
                l.bottom -
                (list.classList.contains('mm-notify-below') ?
                  pad.below + fade
                : 0);
              return {
                cross: focused.className,
                text: focused.parentElement.textContent,
                inWindow: c.top >= 0 && c.bottom <= innerHeight,
                unfaded: c.top >= top - 0.5 && c.bottom <= bottom + 0.5,
                underButton: c.top < b.bottom && c.bottom > b.top,
              };
            },
            [FADE, PAD]
          )
        );
      }
      expect(seen.map(({ text }) => text)).toEqual(
        Array.from({ length: 12 }, (_, n) => `Message ${12 - n}.`)
      );
      for (const one of seen)
        expect(one, one.text).toMatchObject({
          cross: 'mm-notify-close',
          inWindow: true,
          unfaded: true,
          underButton: false,
        });
    });

    test('the fade comes in smoothly, and only where messages are beyond', async ({
      page,
    }) => {
      await add(page, 1, 12);
      const steps = await page.evaluate(async (s) => {
        const list = document.querySelector('.mm-notify-list');
        // Away from the start: the near edge gets messages beyond it.
        const edge = s < 0 ? '--mm-notify-above' : '--mm-notify-below';
        list.scrollTop = s * -100;
        // Every frame for 0.6 s: WebKit for Windows skips frames under load.
        const values = [];
        const running = new Set();
        const start = performance.now();
        while (performance.now() - start < 600) {
          await new Promise((resolve) => requestAnimationFrame(resolve));
          values.push(Number(getComputedStyle(list).getPropertyValue(edge)));
          for (const animation of list.getAnimations())
            running.add(animation.transitionProperty);
        }
        return { values, running: [...running] };
      }, sign);
      expect(steps.running).toContain(
        sign < 0 ? '--mm-notify-above' : '--mm-notify-below'
      );
      expect(steps.values.some((value) => value > 0 && value < 1)).toBe(true);
      expect(steps.values.at(-1)).toBe(1);
    });

    test('with reduced motion the fade switches at once', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await add(page, 1, 12);
      const seen = await page.evaluate(async (s) => {
        const list = document.querySelector('.mm-notify-list');
        list.scrollTop = s * -100;
        await new Promise((resolve) => requestAnimationFrame(resolve));
        await new Promise((resolve) => requestAnimationFrame(resolve));
        return {
          value: getComputedStyle(list).getPropertyValue(
            s < 0 ? '--mm-notify-above' : '--mm-notify-below'
          ),
          running: list.getAnimations().length,
        };
      }, sign);
      expect(seen).toEqual({ value: '1', running: 0 });
    });

    test('the fade really fades: clear at the edge, half way in its middle, opaque past it', async ({
      page,
      problems,
      browserName,
    }) => {
      if (browserName === 'webkit')
        problems.provoked.push(
          /Refused to apply a stylesheet|style-src-elem: inline/
        );
      await page.evaluate(async (long) => {
        for (let n = 1; n <= 8; n += 1)
          await window.t.toast(`${n}. ${long}`, 'neutral', { timeoutMs: 0 });
      }, MULTI_LINE);
      await expect(page.locator('.mm-notify')).toHaveCount(8);
      await page.evaluate(() => {
        window.t.settleMessages();
      });
      // The fourth from the start, across the far edge's fade: scrolled away from the start.
      const rows = await page.evaluate(
        async ([s, fade, pad]) => {
          const list = document.querySelector('.mm-notify-list');
          const l = list.getBoundingClientRect();
          const item = document.querySelectorAll('.mm-notify')[3];
          const r = item.getBoundingClientRect();
          list.scrollTop +=
            s < 0 ? r.top - (l.top - 5) : r.bottom - (l.bottom + 5);
          await new Promise((resolve) => setTimeout(resolve, 500));
          const away = (offset) => (s < 0 ? l.top + offset : l.bottom - offset);
          const at = [
            away(pad / 2),
            away(pad + fade / 2),
            away(pad + fade + 6),
          ];
          const n = item.getBoundingClientRect();
          return {
            x: Math.round((l.left + l.right) / 2),
            at,
            covered: at.map((y) => n.top + 2 < y && n.bottom - 2 > y),
          };
        },
        [sign, FADE, sign < 0 ? PAD.above : PAD.below]
      );
      // Only rows a message covers say anything; the test needs all three.
      expect(rows.covered).toEqual([true, true, true]);
      const buffer = await page.screenshot();
      const colors = await page
        .context()
        .newPage()
        .then(async (blank) => {
          const found = await blank.evaluate(
            async ([src, x, at, width]) => {
              const image = new Image();
              image.src = src;
              await image.decode();
              const canvas = document.createElement('canvas');
              canvas.width = image.width;
              canvas.height = image.height;
              const context = canvas.getContext('2d');
              context.drawImage(image, 0, 0);
              // Device pixels: Playwright's Safari has a scale of 2.
              const scale = image.width / width;
              return at.map((y) => [
                ...context
                  .getImageData(
                    Math.round(x * scale),
                    Math.round(y * scale),
                    1,
                    1
                  )
                  .data.slice(0, 3),
              ]);
            },
            [
              `data:image/png;base64,${buffer.toString('base64')}`,
              rows.x,
              rows.at,
              VIEWPORT.width,
            ]
          );
          await blank.close();
          return found;
        });
      // The page is #fafafa, a neutral message #3ec9ff: red tells them apart.
      const [clear, half, opaque] = colors.map(([red]) => red);
      expect(clear, 'clear zone').toBeGreaterThan(240);
      expect(opaque, 'past the fade').toBeLessThan(75);
      expect(half, 'middle of the fade').toBeGreaterThan(opaque + 40);
      expect(half, 'middle of the fade').toBeLessThan(clear - 40);
    });
  });
}

test.describe('the look of a scrolling stack', () => {
  for (const { name, attribute, sign } of POSITIONS)
    test(name, async ({ page, problems }, testInfo) => {
      if (testInfo.project.name === 'webkit')
        problems.provoked.push(
          /Refused to apply a stylesheet|style-src-elem: inline/
        );
      await page.setViewportSize(VIEWPORT);
      await open(page, { position: attribute });
      if (sign < 0) await tokens(page, { '--notify-top': HEADER });
      await page.evaluate(async () => {
        const kinds = ['success', 'error', 'alert', 'neutral'];
        for (let n = 1; n <= 12; n += 1)
          await window.t.toast(`Message ${n}.`, kinds[n % 4], {
            timeoutMs: 0,
          });
      });
      await expect(page.locator('.mm-notify')).toHaveCount(12);
      await page.waitForTimeout(900);
      await page.evaluate((s) => {
        document.querySelector('.mm-notify-list').scrollTop = s * -120;
      }, sign);
      await page.waitForTimeout(500);
      await page.screenshot({
        path: `test-results/look/${testInfo.project.name}-scroll-${name}.png`,
      });
    });

  test('phone, under a header', async ({ page, problems }, testInfo) => {
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
    await page.waitForTimeout(900);
    const seen = await state(page);
    expect(seen.region).toBeLessThanOrEqual((640 * 2) / 3 + 1);
    expect(seen.below).toBe(true);
    await page.screenshot({
      path: `test-results/look/${testInfo.project.name}-scroll-phone.png`,
    });
  });
});
