/**
 * The handle `toast()` returns: a progress bar, a log, updates, and what
 * happens after the reader closed the message. Then the example page's background work,
 * against its pretend backend (examples/jobs.js), in real time.
 */
import { expect } from '@playwright/test';
import { close, open, test } from './helpers.js';

const UPLOAD = 'Uploading 4 of 10 files…';

/** Settles every animation and transition, then measures the bar against the text. */
const barBox = (page, text) =>
  page.evaluate((message) => {
    window.t.settle();
    const item = window.t.item(message);
    const rect = (element) => element.getBoundingClientRect();
    const bar = item.querySelector('.mm-notify-bar');
    const fill = getComputedStyle(bar, '::after');
    return {
      text: rect(item.querySelector('p')),
      bar: rect(bar),
      item: rect(item),
      transform: fill.transform,
      right: fill.right,
      opacity: fill.opacity,
      running: bar
        .getAnimations({ subtree: true })
        .map((animation) => animation.animationName),
    };
  }, text);

test.describe('the progress bar', () => {
  test('sits under the text, as wide as it, filled to its value', async ({
    page,
  }) => {
    await open(page);
    await page.evaluate(async (text) => {
      await window.t.job('upload', text, 'neutral', { timeoutMs: 0 });
      window.t.jobs.upload.progress(0.4);
    }, UPLOAD);
    const bar = page.getByRole('progressbar', { name: UPLOAD });
    await expect(bar).toBeVisible();
    await expect(bar).toHaveAttribute('aria-valuenow', '40');

    const seen = await barBox(page, UPLOAD);
    close(seen.bar.left, seen.text.left, 1, 'left edge');
    close(seen.bar.right, seen.text.right, 1, 'right edge');
    expect(seen.bar.top).toBeGreaterThan(seen.text.bottom);
    expect(seen.bar.bottom).toBeLessThan(seen.item.bottom);
    expect(seen.bar.height).toBeGreaterThan(4);
    expect(seen.transform).toBe('matrix(0.4, 0, 0, 1, 0, 0)');

    await page.evaluate(() => window.t.jobs.upload.progress(0.7));
    expect((await barBox(page, UPLOAD)).transform).toBe(
      'matrix(0.7, 0, 0, 1, 0, 0)'
    );
    await expect(bar).toHaveAttribute('aria-valuenow', '70');
  });

  test('with no amount known, a stretch runs across it', async ({ page }) => {
    await open(page);
    await page.evaluate(async () => {
      await window.t.job('bank', 'Waiting for the bank…', 'alert');
      window.t.jobs.bank.progress(true);
    });
    const bar = page.getByRole('progressbar', {
      name: 'Waiting for the bank…',
    });
    await expect(bar).toBeVisible();
    await expect(bar).not.toHaveAttribute('aria-valuenow');
    const running = await page.evaluate(() =>
      window.t
        .item('Waiting for the bank…')
        .querySelector('.mm-notify-bar')
        .getAnimations({ subtree: true })
        .map((animation) => [animation.animationName, animation.playState])
    );
    expect(running).toEqual([['mm-notify-busy', 'running']]);
  });

  test('stands still under reduced motion, filled in a half tone', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    await page.evaluate(async () => {
      await window.t.job('bank', 'Waiting for the bank…', 'alert');
      window.t.jobs.bank.progress(true);
    });
    await expect(page.getByRole('progressbar')).toBeVisible();
    const seen = await page.evaluate(() => {
      const bar = window.t
        .item('Waiting for the bank…')
        .querySelector('.mm-notify-bar');
      const fill = getComputedStyle(bar, '::after');
      return {
        animations: document.getAnimations().length,
        right: fill.right,
        opacity: fill.opacity,
        transform: fill.transform,
      };
    });
    expect(seen).toEqual({
      animations: 0,
      right: '0px',
      opacity: '0.5',
      transform: 'none',
    });
    // A value moves the fill at once, with no transition.
    await page.evaluate(() => window.t.jobs.bank.progress(0.5));
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  });

  test('holds the message until it goes, then its time runs', async ({
    page,
  }) => {
    await page.clock.install();
    await open(page);
    await page.evaluate(async () => {
      await window.t.job('upload', 'Uploading…', 'success');
      window.t.jobs.upload.progress(0.1);
    });
    await expect(page.getByRole('progressbar')).toBeVisible();
    await page.clock.runFor(60_000);
    await expect(page.locator('.mm-notify')).toHaveCount(1);
    await page.evaluate(() =>
      window.t.jobs.upload.replace('Uploaded.', 'success')
    );
    await expect(page.getByRole('progressbar')).toHaveCount(0);
    await page.clock.runFor(5400);
    await expect(page.locator('.mm-notify')).toHaveCount(0);
  });

  test('shows under forced colors, as the cross does', async ({ page }) => {
    // Forced colors give backgrounds the page's color, and the bar
    // and the cross are drawn as backgrounds: both vanished (Chromium).
    await page.emulateMedia({ forcedColors: 'active' });
    await open(page);
    await page.evaluate(async (text) => {
      await window.t.job('upload', text, 'neutral', { timeoutMs: 0 });
      window.t.jobs.upload.progress(0.4);
    }, UPLOAD);
    await expect(page.getByRole('progressbar')).toBeVisible();
    const seen = await page.evaluate((text) => {
      const item = window.t.item(text);
      const background = (element, pseudo) =>
        getComputedStyle(element, pseudo).backgroundColor;
      return {
        forced: matchMedia('(forced-colors: active)').matches,
        box: background(item),
        fill: background(item.querySelector('.mm-notify-bar'), '::after'),
        track: background(item.querySelector('.mm-notify-bar'), '::before'),
        cross: background(item.querySelector('.mm-notify-close'), '::before'),
      };
    }, UPLOAD);
    // An engine that doesn't emulate them has nothing to show here.
    if (!seen.forced) return;
    expect(seen.fill).not.toBe(seen.box);
    expect(seen.track).toBe(seen.fill);
    expect(seen.cross).toBe(seen.fill);
  });

  test('the box has an edge under forced colors, and none without', async ({
    page,
    problems,
  }, testInfo) => {
    // Forced colors take the box's color and glow, so its
    // words stood on the page over the page's content. A transparent outline, which
    // forced colors draw in the text's color.
    if (testInfo.project.name === 'webkit')
      problems.provoked.push(
        /Refused to apply a stylesheet|style-src-elem: inline/
      );
    const edge = () =>
      page.evaluate((text) => {
        window.t.settle();
        const item = window.t.item(text);
        const style = getComputedStyle(item);
        return {
          // WebKit matches the query when emulated but forces no colors (it has no
          // forced colors mode): nothing to check there.
          forced:
            matchMedia('(forced-colors: active)').matches &&
            CSS.supports('forced-color-adjust', 'none'),
          style: style.outlineStyle,
          width: style.outlineWidth,
          color: style.outlineColor,
          text: style.color,
        };
      }, UPLOAD);
    await open(page);
    await page.evaluate(async (text) => {
      await window.t.job('upload', text, 'neutral', { timeoutMs: 0 });
    }, UPLOAD);
    const item = page.locator('.mm-notify');
    await expect(item).toBeVisible();
    const plain = await edge();
    expect(plain).toMatchObject({ style: 'solid', width: '1px' });
    expect(plain.color).toBe('rgba(0, 0, 0, 0)');
    // Nothing to see without forced colors: the same pixels as with no outline at all.
    // Each one taken until two in a row agree: under load a shot can come before the
    // frame is drawn in full (one such difference was seen in Chrome).
    const steady = async () => {
      let shot = await item.screenshot();
      for (let tries = 0; tries < 5; tries++) {
        const next = await item.screenshot();
        if (next.equals(shot)) break;
        shot = next;
      }
      return shot;
    };
    await page.waitForTimeout(400);
    const withEdge = await steady();
    await item.evaluate((element) => {
      element.style.outline = 'none';
    });
    const without = await steady();
    expect(withEdge.equals(without)).toBe(true);
    await item.evaluate((element) => {
      element.style.outline = '';
    });

    await page.emulateMedia({ forcedColors: 'active' });
    const forced = await edge();
    if (!forced.forced) return;
    expect(forced.style).toBe('solid');
    expect(forced.color).not.toBe('rgba(0, 0, 0, 0)');
    expect(forced.color).toBe(forced.text);
    await page.screenshot({
      path: `test-results/look/${testInfo.project.name}-forced-colors.png`,
    });
  });
});

test.describe('the log', () => {
  const lines = (from, to) =>
    Array.from({ length: to - from + 1 }, (_, n) => `Line ${from + n}`);

  const logState = (page) =>
    page.evaluate(() => {
      const log = document.querySelector('.mm-notify-log');
      const item = log.closest('.mm-notify');
      return {
        top: log.scrollTop,
        atEnd: log.scrollTop + log.clientHeight >= log.scrollHeight - 1,
        lines: log.childElementCount,
        height: log.getBoundingClientRect().height,
        lineHeight: parseFloat(getComputedStyle(log).lineHeight),
        item: item.getBoundingClientRect().height,
        max: parseFloat(
          getComputedStyle(document.querySelector('.mm-notify-region'))
            .maxHeight
        ),
      };
    });

  test('shows the newest line, scrolls inside its message, keeps the place of a reader who went up', async ({
    page,
  }) => {
    await open(page);
    await page.evaluate(
      async (all) => {
        await window.t.job('deploy', 'Deploying…', 'neutral', { timeoutMs: 0 });
        for (const line of all) window.t.jobs.deploy.log(line);
      },
      lines(1, 30)
    );
    await expect(page.getByRole('log')).toBeVisible();
    await page.evaluate(() => window.t.settle());
    let seen = await logState(page);
    expect(seen.atEnd).toBe(true);
    expect(seen.lines).toBe(30);
    // About six lines tall, whatever the number of lines: the stack stays in its 2/3.
    expect(seen.height).toBeLessThan(seen.lineHeight * 7 + 12);
    expect(seen.height).toBeGreaterThan(seen.lineHeight * 5);
    expect(seen.item).toBeLessThan(seen.max);
    await expect(page.getByText('Line 30')).toBeInViewport();

    // A reader scrolls up: a new line leaves them where they are. The log follows at the
    // next frame, once for all the lines until then: two frames.
    await page.evaluate(async () => {
      document.querySelector('.mm-notify-log').scrollTop = 0;
      window.t.jobs.deploy.log('Line 31');
      await new Promise((done) => {
        requestAnimationFrame(() => requestAnimationFrame(done));
      });
    });
    seen = await logState(page);
    expect(seen.top).toBe(0);
    // Back at the end: it follows again.
    await page.evaluate(async () => {
      const log = document.querySelector('.mm-notify-log');
      log.scrollTop = log.scrollHeight;
      window.t.jobs.deploy.log('Line 32');
      await new Promise((done) => {
        requestAnimationFrame(() => requestAnimationFrame(done));
      });
    });
    expect((await logState(page)).atEnd).toBe(true);
  });

  test('is reached by Tab after the close button, and holds the message while focused', async ({
    page,
  }) => {
    await page.clock.install();
    await open(page);
    await page.evaluate(async () => {
      await window.t.job('deploy', 'Deploying…', 'success');
      window.t.jobs.deploy.log('Building');
    });
    await page.locator('.mm-notify-close').focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('log')).toBeFocused();
    await page.clock.runFor(30_000);
    await expect(page.locator('.mm-notify')).toHaveCount(1);
  });
});

// The focus in a closing message fell to the page's start.
test.describe('the focus after closing', () => {
  const NAME = 'Neutral';

  test('goes back where it came from: the cross by keyboard, close() from the log', async ({
    page,
  }) => {
    await open(page);
    await page.evaluate(async () => {
      await window.t.job('saved', 'Saved.', 'success', { timeoutMs: 0 });
    });
    const origin = page.getByRole('button', { name: NAME, exact: true });
    await origin.focus();
    await page.locator('.mm-notify-close').focus();
    await page.keyboard.press('Enter');
    await expect(origin).toBeFocused();
    await expect(page.locator('.mm-notify')).toHaveCount(0);
    await expect(origin).toBeFocused();

    await page.evaluate(async () => {
      await window.t.job('deploy', 'Deploying…', 'neutral', { timeoutMs: 0 });
      window.t.jobs.deploy.log('Building');
    });
    await page.locator('.mm-notify-close').focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('log')).toBeFocused();
    await page.evaluate(() => {
      window.t.jobs.deploy.close();
    });
    await expect(origin).toBeFocused();
  });

  test('stays in the message on replace, and is left alone when its origin is gone', async ({
    page,
  }) => {
    await open(page);
    await page.evaluate(async () => {
      await window.t.job('deploy', 'Deploying…', 'neutral', { timeoutMs: 0 });
      window.t.jobs.deploy.log('Building');
    });
    const origin = page.getByRole('button', { name: NAME, exact: true });
    await origin.focus();
    await page.locator('.mm-notify-close').focus();
    await page.evaluate(() => {
      window.t.jobs.deploy.replace('Deployed.', 'success', { timeoutMs: 0 });
    });
    await expect(page.locator('.mm-notify-close')).toBeFocused();
    await origin.evaluate((button) => {
      button.remove();
    });
    await page.evaluate(() => {
      window.t.jobs.deploy.close();
    });
    await expect(page.locator('.mm-notify')).toHaveCount(0);
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe(
      'BODY'
    );
  });

  // With an origin per message, closing the one the focus came
  // through handed it back to the other, whose origin then became a closed cross: body.
  test('goes back to the page, not to a message it came through', async ({
    page,
  }) => {
    await open(page);
    await page.evaluate(async () => {
      await window.t.job('a', 'Message A', 'neutral', { timeoutMs: 0 });
      await window.t.job('b', 'Message B', 'neutral', { timeoutMs: 0 });
    });
    const cross = (text) =>
      page.locator('.mm-notify', { hasText: text }).locator('.mm-notify-close');
    const origin = page.getByRole('button', { name: NAME, exact: true });
    await origin.focus();
    await cross('Message B').focus(); // the newest is first
    await page.keyboard.press('Tab');
    await expect(cross('Message A')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(origin).toBeFocused();
    await expect(page.locator('.mm-notify')).toHaveCount(1);
    await cross('Message B').focus();
    await page.keyboard.press('Enter');
    await expect(origin).toBeFocused();
    await expect(page.locator('.mm-notify')).toHaveCount(0);
    await expect(origin).toBeFocused();
  });

  // Clear all went with the focus on it, which fell to the body.
  test('Clear all gives it back when it goes', async ({ page }) => {
    await open(page);
    await page.evaluate(async () => {
      for (const text of ['One', 'Two', 'Three'])
        await window.t.job(text, text, 'error');
    });
    const clearAll = page.getByRole('button', { name: 'Clear all' });
    await expect(clearAll).toBeVisible();
    const origin = page.getByRole('button', { name: NAME, exact: true });
    await origin.focus();
    await clearAll.focus();
    await page.keyboard.press('Enter');
    await expect(origin).toBeFocused();
    await expect(page.locator('.mm-notify')).toHaveCount(0);
    await expect(clearAll).toBeHidden();
    await expect(origin).toBeFocused();
  });

  // With `preventScroll` always, a keyboard's focus went back to a
  // button out of sight, its ring seen nowhere (WCAG 2.4.7).
  test('a keyboard focus comes into sight; a click on the cross moves no page', async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width: 800, height: 400 });
    await open(page);
    await page.evaluate(async () => {
      await window.t.job('one', 'One', 'neutral', { timeoutMs: 0 });
    });
    await expect(page.locator('.mm-notify')).toHaveCount(1);
    const state = () =>
      page.evaluate(() => {
        const origin = document.getElementById('origin');
        const { top, bottom } = origin.getBoundingClientRect();
        return {
          focused: document.activeElement === origin,
          inSight: bottom > 0 && top < innerHeight,
          y: Math.round(scrollY),
        };
      });
    // The page's last button before the region; Tab takes the focus on to the cross.
    await page.evaluate(() => {
      const origin = document.createElement('button');
      origin.id = 'origin';
      origin.textContent = 'Origin';
      document.body.insertBefore(
        origin,
        document.querySelector('.mm-notify-region')
      );
      origin.focus();
    });
    await page.keyboard.press('Tab');
    await expect(page.locator('.mm-notify-close')).toBeFocused();
    await page.evaluate(() => window.scrollTo(0, 0));
    expect((await state()).inSight).toBe(false);
    await page.keyboard.press('Enter');
    await expect.poll(state).toMatchObject({ focused: true, inSight: true });
    await expect(page.locator('.mm-notify')).toHaveCount(0);

    // A pointer: the origin clicked at the page's end, the cross clicked at its start.
    await page.evaluate(async () => {
      await window.t.job('two', 'Two', 'neutral', { timeoutMs: 0 });
    });
    await expect(page.locator('.mm-notify')).toHaveCount(1);
    await page.locator('#origin').click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator('.mm-notify-close').click();
    await expect(page.locator('.mm-notify')).toHaveCount(0);
    // WebKit doesn't focus a button on a click: the focus was never in the message.
    expect(await state()).toEqual({
      focused: browserName !== 'webkit',
      inSight: false,
      y: 0,
    });
  });
});

// A silent message read out again joins the live region first; its
// words follow 100 ms later, so no screen reader misses them with the change of voice.
test('a silent message that is read out again: live first, its words 100 ms later', async ({
  page,
}) => {
  await page.clock.install();
  await open(page);
  await page.evaluate(async () => {
    await window.t.job('save', 'Saving…', 'neutral', {
      announce: false,
      timeoutMs: 0,
    });
    window.t.jobs.save.progress(true);
  });
  const item = page.locator('.mm-notify');
  await expect(item).toHaveAttribute('aria-live', 'off');
  // In one task: the clock runs, and a slow engine's round trip may take 100 ms.
  const now = await page.evaluate(() => {
    const element = document.querySelector('.mm-notify');
    const read = () => ({
      live: element.getAttribute('aria-live'),
      role: element.getAttribute('role'),
      text: element.querySelector('p').textContent,
    });
    window.t.read = read;
    window.t.jobs.save.replace('Saving failed.', 'error');
    return read();
  });
  expect(now).toEqual({ live: null, role: null, text: 'Saving…' });
  await page.clock.runFor(100);
  expect(await page.evaluate(() => window.t.read())).toEqual({
    live: null,
    role: 'alert',
    text: 'Saving failed.',
  });
});

// Work in progress is never shared with other work.
test('the same text as a message with a progress bar shows a message of its own', async ({
  page,
}) => {
  await open(page);
  const same = await page.evaluate(async () => {
    const { t } = window;
    await t.job('one', 'Saving…', 'neutral');
    t.jobs.one.progress(true);
    await t.job('two', 'Saving…', 'neutral');
    await t.job('three', 'Saving…', 'neutral');
    return [t.jobs.one === t.jobs.two, t.jobs.two === t.jobs.three];
  });
  expect(same).toEqual([false, true]);
  await expect(page.locator('.mm-notify')).toHaveCount(2);
});

test('an update after the reader closed the message does nothing, and it stays closed', async ({
  page,
}) => {
  await open(page);
  await page.evaluate(async () => {
    await window.t.job('upload', 'Uploading…', 'neutral', { timeoutMs: 0 });
    window.t.jobs.upload.progress(0.2).log('a.txt');
  });
  await page.locator('.mm-notify-close').click();
  const after = await page.evaluate(async () => {
    const job = window.t.jobs.upload;
    let told = false;
    void job.whenClosed.then(() => {
      told = true;
    });
    job
      .update('Uploading 2 of 3…', 'alert')
      .progress(0.8)
      .log('b.txt')
      .replace('Uploaded.', 'success');
    job.close();
    await new Promise((resolve) => {
      setTimeout(resolve, 500);
    });
    return { closed: job.closed, told };
  });
  expect(after).toEqual({ closed: true, told: true });
  await expect(page.locator('.mm-notify')).toHaveCount(0);
  expect(await page.evaluate(() => window.t.regionOpen())).toBe(false);
});

test('the accessibility tree: a named progress bar, a log, read out only when asked', async ({
  page,
  browserName,
}) => {
  await open(page);
  await page.evaluate(async (text) => {
    await window.t.job('upload', text, 'neutral', {
      timeoutMs: 0,
      announce: false,
    });
    window.t.jobs.upload.progress(0.4, '4 of 10 files').log('a.txt');
  }, UPLOAD);
  await expect(page.getByRole('progressbar', { name: UPLOAD })).toBeVisible();
  await expect(page.getByRole('progressbar')).toHaveAttribute(
    'aria-valuetext',
    '4 of 10 files'
  );
  await expect(page.getByRole('log')).toHaveText('a.txt');
  const item = page.locator('.mm-notify');
  await expect(item).toHaveAttribute('aria-live', 'off');

  if (browserName === 'chromium') {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Accessibility.enable');
    const tree = async () =>
      (await cdp.send('Accessibility.getFullAXTree')).nodes;
    const property = (node, name) =>
      node.properties?.find((p) => p.name === name)?.value.value;
    let nodes = await tree();
    const bar = nodes.find((node) => node.role?.value === 'progressbar');
    expect(bar.name.value).toBe(UPLOAD);
    expect(bar.value.value).toBe(40);
    // CDP's valuetext stays "" here whatever the attribute: checked on the element below.
    expect(bar.ignored).toBe(false);
    const log = nodes.find((node) => node.role?.value === 'log');
    expect(log.ignored).toBe(false);
    // Active live regions only (CDP shows no "off" one): the list, nothing else.
    const live = () =>
      nodes.map((node) => property(node, 'live')).filter(Boolean);
    expect(live()).toEqual(['polite']);

    // The outcome, an error: read out, as an alert.
    await page.evaluate(() =>
      window.t.jobs.upload.replace('The upload failed.', 'error')
    );
    // Its kind, words and alert follow its joining the live region by 100 ms.
    await expect(page.getByRole('alert')).toHaveText('The upload failed.');
    nodes = await tree();
    expect(live().sort()).toEqual(['assertive', 'polite']);
    expect(nodes.filter((node) => node.role?.value === 'alert')).toHaveLength(
      1
    );
    expect(nodes.some((node) => node.role?.value === 'progressbar')).toBe(
      false
    );
  } else {
    await page.evaluate(() =>
      window.t.jobs.upload.replace('The upload failed.', 'error')
    );
    await expect(page.getByRole('alert')).toHaveText('The upload failed.');
  }
  await expect(item).not.toHaveAttribute('aria-live');
});

test('an update before the frame keeps the announcement it came with', async ({
  page,
}) => {
  // A first update before the frame (a fast answer, a tab in the
  // background) silenced a message that was to be read out.
  await open(page);
  const seen = await page.evaluate(async () => {
    const { toast } = await window.t.load();
    const job = toast('Exporting…');
    job.update('Exporting 1 of 12…');
    toast('Still saving…', 'neutral', { announce: false }).update(
      'Still saving, 2 of 3…'
    );
    await new Promise((resolve) => {
      requestAnimationFrame(() => setTimeout(resolve, 50));
    });
    const live = (text) => window.t.item(text).getAttribute('aria-live');
    const before = [live('Exporting 1 of 12…'), live('Still saving, 2 of 3…')];
    job.update('Exporting 2 of 12…');
    return [...before, live('Exporting 2 of 12…')];
  });
  expect(seen).toEqual([null, 'off', 'off']);
});

test.describe('the example page, its pretend backend', () => {
  test('polls an export: a bar that fills, then the outcome in its place', async ({
    page,
  }) => {
    test.slow();
    await open(page);
    await page.locator('#poll').click();
    const bar = page.getByRole('progressbar');
    await expect(bar).toBeVisible();
    await expect(page.locator('.mm-notify p')).toHaveText(
      /Exporting your orders: \d+ of 12 files…/
    );
    await expect(bar).toHaveAttribute('aria-valuetext', /\d+ of 12 files/);
    await expect(page.locator('.mm-notify p')).toHaveText(
      'Exported 12 files.',
      {
        timeout: 15_000,
      }
    );
    await expect(page.locator('.mm-notify')).toHaveCount(1);
    await expect(page.locator('.mm-notify')).toHaveClass(/mm-notify-success/);
    await expect(bar).toHaveCount(0);
  });

  test('streams a deploy: lines from an EventSource, then the outcome with its log', async ({
    page,
  }) => {
    test.slow();
    await open(page);
    await page.locator('#stream').click();
    await expect(page.getByRole('log')).toContainText('Resolving packages');
    await expect(page.locator('.mm-notify p')).toHaveText('Deployed.', {
      timeout: 15_000,
    });
    await expect(page.getByRole('log').locator('div')).toHaveCount(12);
    await expect(page.locator('.mm-notify')).toHaveClass(/mm-notify-success/);
    await expect(page.getByRole('progressbar')).toHaveCount(0);
  });

  test('a stream closed by the reader stops asking', async ({ page }) => {
    await open(page);
    // What the page does with its EventSource, seen from inside.
    await page.evaluate(() => {
      window.sources = [];
      const { close } = EventSource.prototype;
      EventSource.prototype.close = function () {
        window.sources.push(this.url);
        close.call(this);
      };
    });
    await page.locator('#stream').click();
    await expect(page.getByRole('log')).toContainText('Resolving packages');
    await page.locator('.mm-notify-close').click();
    await expect(page.locator('.mm-notify')).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => window.sources))
      .toEqual([expect.stringMatching(/\/api\/jobs\/\d+\/log$/)]);
  });

  test('a slow request: an unannounced progress message after 2 s, turned into the outcome', async ({
    page,
  }) => {
    await open(page);
    await page.locator('#slow').click();
    const item = page.locator('.mm-notify');
    await expect(item.locator('p')).toHaveText('Still saving…', {
      timeout: 5000,
    });
    await expect(item).toHaveAttribute('aria-live', 'off');
    await expect(page.getByRole('progressbar')).not.toHaveAttribute(
      'aria-valuenow'
    );
    await expect(item.locator('p')).toHaveText('Saved.', { timeout: 8000 });
    await expect(item).toHaveCount(1);
    await expect(item).not.toHaveAttribute('aria-live');
    await expect(page.getByRole('progressbar')).toHaveCount(0);
  });

  test('a fast request shows only the outcome', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      window.seen = [];
      new MutationObserver(() => {
        for (const p of document.querySelectorAll('.mm-notify p'))
          if (!window.seen.includes(p.textContent))
            window.seen.push(p.textContent);
      }).observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    });
    await page.locator('#fast').click();
    await expect(page.locator('.mm-notify p')).toHaveText('Saved.');
    await page.waitForTimeout(2500);
    expect(await page.evaluate(() => window.seen)).toEqual(['Saved.']);
  });
});

// A bar holds its message until the outcome, and the examples (and
// the README's patterns) had ways to end without one: a "Still saving…" or a bar that
// stayed up for good after the network failed.
test.describe('the example page when the network fails', () => {
  /** The browsers' own console lines about a failed or refused request. */
  const failedRequests =
    /Failed to load resource|net::|NetworkError|EventSource|404|Not Found|could not be loaded|access control|establish a connection/i;

  const messages = (page) =>
    page.evaluate(() =>
      [...document.querySelectorAll('.mm-notify')].map((item) => ({
        text: item.querySelector('p').textContent,
        bar: Boolean(item.querySelector('.mm-notify-bar')),
      }))
    );

  test('a slow request that fails after its progress showed: that message becomes the failure', async ({
    page,
    problems,
  }) => {
    problems.provoked.push(failedRequests);
    await open(page);
    await page.route('**/api/slow**', async (route) => {
      await new Promise((resolve) => {
        setTimeout(resolve, 2600);
      });
      await route.abort();
    });
    await page.locator('#slow').click();
    await expect(page.locator('.mm-notify p')).toHaveText('Still saving…', {
      timeout: 5000,
    });
    await expect(page.locator('.mm-notify p')).toHaveText(
      'The server is not reachable. Please try again.',
      { timeout: 5000 }
    );
    expect(await messages(page)).toEqual([
      { text: 'The server is not reachable. Please try again.', bar: false },
    ]);
  });

  test('a request that fails at once: no progress message comes later', async ({
    page,
    problems,
  }) => {
    problems.provoked.push(failedRequests);
    await open(page);
    await page.route('**/api/slow**', (route) => route.abort());
    await page.locator('#slow').click();
    await expect(page.locator('.mm-notify p')).toHaveText(
      'The server is not reachable. Please try again.'
    );
    await page.waitForTimeout(2500);
    expect(await messages(page)).toEqual([
      { text: 'The server is not reachable. Please try again.', bar: false },
    ]);
  });

  test('a poll that fails: the bar gives way to the failure', async ({
    page,
    problems,
  }) => {
    problems.provoked.push(failedRequests);
    await open(page);
    await page.route('**/api/jobs/*', (route) => route.abort());
    await page.locator('#poll').click();
    await expect(page.locator('.mm-notify p')).toHaveText(
      'The export stopped. Please try again.'
    );
    expect(await messages(page)).toEqual([
      { text: 'The export stopped. Please try again.', bar: false },
    ]);
  });

  test('a stream the server refuses: the bar gives way to the failure', async ({
    page,
    problems,
  }) => {
    problems.provoked.push(failedRequests);
    await open(page);
    await page.route('**/api/jobs/*/log', (route) =>
      route.fulfill({ status: 404, body: 'No such job' })
    );
    await page.locator('#stream').click();
    await expect(page.locator('.mm-notify p')).toHaveText(
      'The deploy lost its connection.'
    );
    expect(await messages(page)).toEqual([
      { text: 'The deploy lost its connection.', bar: false },
    ]);
  });
});

test.describe('to look at', () => {
  for (const [name, viewport] of [
    ['desktop', { width: 1366, height: 800 }],
    ['phone', { width: 390, height: 844 }],
  ])
    test(`bars and a log, ${name}`, async ({ page, problems }, testInfo) => {
      // Playwright's own <style> in a WebKit screenshot, refused by the CSP (look.spec.js).
      if (testInfo.project.name === 'webkit')
        problems.provoked.push(
          /Refused to apply a stylesheet|style-src-elem: inline/
        );
      await page.setViewportSize(viewport);
      await open(page);
      await page.evaluate(async () => {
        const { t } = window;
        await t.job('saved', 'Saved.', 'success', { timeoutMs: 0 });
        await t.job(
          'export',
          'Exporting your orders: 5 of 12 files…',
          'neutral',
          {
            timeoutMs: 0,
          }
        );
        t.jobs.export.progress(5 / 12);
        await t.job('bank', 'Waiting for the bank…', 'alert', { timeoutMs: 0 });
        t.jobs.bank.progress(true);
        await t.job('deploy', 'Deploying the release…', 'neutral', {
          timeoutMs: 0,
        });
        t.jobs.deploy.progress(0.75);
        for (let line = 1; line <= 9; line += 1)
          t.jobs.deploy.log(`12:00:0${line}  Step ${line} of the deploy`);
        await t.job(
          'failed',
          'The upload failed: the file is too large.',
          'error',
          {
            timeoutMs: 0,
          }
        );
        t.jobs.failed.progress(0.3);
      });
      await expect(page.locator('.mm-notify')).toHaveCount(5);
      await page.evaluate(() => {
        window.t.settleMessages();
        // The running stretch, held where it shows.
        for (const animation of document.getAnimations())
          if (animation.animationName === 'mm-notify-busy') {
            animation.pause();
            animation.currentTime = 600;
          }
      });
      await page.waitForTimeout(400);
      await page.screenshot({
        path: `test-results/look/${testInfo.project.name}-progress-${name}.png`,
      });
    });
});
