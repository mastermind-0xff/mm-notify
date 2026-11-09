/** The look, the CSP, the top layer: what only a real engine can say. */
import { expect } from '@playwright/test';
import { open, test } from './helpers.js';

const KINDS = {
  success: { background: [0, 231, 127], glow: [0, 213, 127] },
  error: { background: [239, 64, 60], glow: [239, 64, 60] },
  alert: { background: [255, 213, 86], glow: [255, 213, 86] },
  neutral: { background: [62, 201, 255], glow: [62, 201, 255] },
};

const numbers = (css) => (css.match(/[\d.]+/g) ?? []).map(Number);

for (const [kind, colors] of Object.entries(KINDS)) {
  test(`${kind}: renders with its colors`, async ({ page }) => {
    await open(page);
    await page.locator(`.row [data-kind="${kind}"]`).click();
    const item = page.locator(`.mm-notify-${kind}`);
    await expect(item).toBeVisible();
    const seen = await item.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        background: style.backgroundColor,
        shadow: style.boxShadow,
        text: style.color,
        radius: style.borderRadius,
        icon: element.querySelector('svg').getBoundingClientRect().width,
        crossWidth: element.querySelector('.mm-notify-close').offsetWidth,
      };
    });
    expect(numbers(seen.background).slice(0, 3)).toEqual(colors.background);
    expect(numbers(seen.shadow).slice(0, 4)).toEqual([...colors.glow, 0.3]);
    expect(numbers(seen.text).slice(0, 3)).toEqual([17, 17, 17]);
    expect(seen.radius).toBe('9px');
    expect(seen.icon).toBe(20);
    expect(seen.crossWidth).toBe(32);
  });
}

test('the strict CSP is on and the constructable sheet is used', async ({
  page,
}) => {
  const response = await page.goto('/examples/');
  const csp = response.headers()['content-security-policy'];
  expect(csp).toContain("style-src 'self'");
  expect(csp).toContain("require-trusted-types-for 'script'");

  const hadNothing = await page.evaluate(() => ({
    sheets: document.adoptedStyleSheets.length,
    region: document.querySelectorAll('.mm-notify-region').length,
  }));
  expect(hadNothing).toEqual({ sheets: 0, region: 0 });

  await page.evaluate(() => window.t.toast('Styled.', 'success'));
  await expect(page.locator('.mm-notify')).toBeVisible();
  const styled = await page.evaluate(() => ({
    sheets: document.adoptedStyleSheets.length,
    rules: document.adoptedStyleSheets[0].cssRules.length,
    ownStyle: document.querySelectorAll('style').length,
    regionPosition: getComputedStyle(
      document.querySelector('.mm-notify-region')
    ).position,
  }));
  expect(styled.sheets).toBe(1);
  expect(styled.rules).toBeGreaterThan(10);
  expect(styled.ownStyle).toBe(0);
  expect(styled.regionPosition).toBe('fixed');
});

test('an inline style is really blocked here: the sheet is not just allowed by a loose page', async ({
  page,
  problems,
}) => {
  problems.provoked.push(/style-src|stylesheet|inline style/i);
  await open(page);
  const applied = await page.evaluate(async () => {
    const style = document.createElement('style');
    style.textContent = 'body { scroll-margin-top: 7px; }';
    document.head.append(style);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const margin = getComputedStyle(document.body).scrollMarginTop;
    style.remove();
    return margin;
  });
  expect(applied).toBe('0px');
});

test('Trusted Types holds where the browser has it, and a message passes it', async ({
  page,
  problems,
  browser,
  browserName,
}, testInfo) => {
  problems.provoked.push(
    /TrustedHTML|injection sink|require-trusted-types-for/
  );
  await open(page);
  const result = await page.evaluate(async () => {
    const supported = 'trustedTypes' in window;
    let blocked = false;
    try {
      document.createElement('div').innerHTML = '<b>x</b>';
    } catch {
      blocked = true;
    }
    await window.t.toast('<b>Plain</b> text', 'error', { timeoutMs: 0 });
    return { supported, blocked };
  });
  testInfo.annotations.push({
    type: 'trusted-types',
    description: `${browserName} ${browser.version()}: ${JSON.stringify(result)}`,
  });
  expect(result.blocked).toBe(result.supported);
  const text = page.locator('.mm-notify p');
  await expect(text).toHaveText('<b>Plain</b> text');
  expect(await text.locator('b').count()).toBe(0);
});

test('the page form: markup stays text, and the live region is in place', async ({
  page,
}) => {
  await open(page);
  await page.locator('#custom input[name="sticky"]').check();
  await page.locator('#custom button[type="submit"]').click();
  const item = page.locator('.mm-notify').first();
  await expect(item.locator('p')).toHaveText(
    'Saved. <b>Markup</b> stays plain text.'
  );
  const list = page.locator('.mm-notify-list');
  await expect(list).toHaveAttribute('aria-live', 'polite');
  await page.evaluate(() =>
    window.t.toast('Failed.', 'error', { timeoutMs: 0 })
  );
  await expect(page.locator('.mm-notify-error')).toHaveAttribute(
    'role',
    'alert'
  );
});

test.describe('top layer', () => {
  test('a message sits above a popover menu opened before it', async ({
    page,
  }) => {
    await open(page);
    await page.locator('[popovertarget="menu"]').click();
    await expect(page.locator('#menu')).toBeVisible();
    await page.locator('#menu [data-kind="success"]').click();
    const item = page.locator('.mm-notify-success');
    await expect(item).toBeVisible();

    const hit = await page.evaluate(async () => {
      window.t.settle();
      const box = window.t.item('Your changes are saved.');
      const a = box.getBoundingClientRect();
      const b = document.querySelector('#menu').getBoundingClientRect();
      const x = (Math.max(a.left, b.left) + Math.min(a.right, b.right)) / 2;
      const y = (Math.max(a.top, b.top) + Math.min(a.bottom, b.bottom)) / 2;
      return {
        overlaps: a.left < b.right && b.left < a.right && a.top < b.bottom,
        onMessage: window.t.hits(box, x, y),
        menuOpen: document.querySelector('#menu').matches(':popover-open'),
        regionOpen: window.t.regionOpen(),
      };
    });
    expect(hit).toEqual({
      overlaps: true,
      onMessage: true,
      menuOpen: true,
      regionOpen: true,
    });
  });

  // aesweets D47 (a): the top layer stacks by opening order. The package opens its
  // region again for a new message, which replays nothing: it is display: flex closed.
  test('a new message comes above a popover menu opened after the messages, replaying none', async ({
    page,
  }) => {
    await open(page);
    await page.evaluate(() =>
      window.t.toast('Earlier.', 'alert', { timeoutMs: 0 })
    );
    await expect(page.locator('.mm-notify')).toHaveCount(1);
    await page.evaluate(() => {
      window.t.settle();
    });
    await page.locator('[popovertarget="menu"]').click();
    await expect(page.locator('#menu')).toBeVisible();
    const underBefore = await page.evaluate(() => {
      const a = window.t.item('Earlier.').getBoundingClientRect();
      const b = document.querySelector('#menu').getBoundingClientRect();
      const x = (Math.max(a.left, b.left) + Math.min(a.right, b.right)) / 2;
      const y = (Math.max(a.top, b.top) + Math.min(a.bottom, b.bottom)) / 2;
      return window.t.hits(document.querySelector('#menu'), x, y);
    });
    expect(underBefore).toBe(true);

    await page.locator('#menu [data-kind="success"]').click();
    await expect(page.locator('.mm-notify')).toHaveCount(2);
    // At once, before anything settles: the earlier message runs no animation again.
    expect(
      await page.evaluate(
        () => window.t.item('Earlier.').getAnimations().length
      )
    ).toBe(0);
    const seen = await page.evaluate(() => {
      window.t.settle();
      const menu = document.querySelector('#menu');
      const b = menu.getBoundingClientRect();
      const over = (text) => {
        const item = window.t.item(text);
        const a = item.getBoundingClientRect();
        const x = (Math.max(a.left, b.left) + Math.min(a.right, b.right)) / 2;
        const y = (Math.max(a.top, b.top) + Math.min(a.bottom, b.bottom)) / 2;
        return (
          a.top < b.bottom && b.top < a.bottom && window.t.hits(item, x, y)
        );
      };
      return {
        newOnTop: over('Your changes are saved.'),
        earlierOnTop: over('Earlier.'),
        menuOpen: menu.matches(':popover-open'),
        regionOpen: window.t.regionOpen(),
      };
    });
    expect(seen).toEqual({
      newOnTop: true,
      earlierOnTop: true,
      menuOpen: true,
      regionOpen: true,
    });
  });

  test('raised for a new message, the region keeps the focus and the scroll', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 800, height: 420 });
    await open(page);
    await page.evaluate(async () => {
      for (let n = 1; n <= 12; n += 1)
        await window.t.toast(`Message ${n}.`, 'neutral', { timeoutMs: 0 });
    });
    await expect(page.locator('.mm-notify')).toHaveCount(12);
    await page.evaluate(() => {
      window.t.settle();
    });
    const cross = page
      .locator('.mm-notify', { hasText: 'Message 6.' })
      .locator('.mm-notify-close');
    await cross.focus();
    const menuOnTop = () =>
      page.evaluate(() => {
        const b = document.querySelector('#menu').getBoundingClientRect();
        const hit = document.elementFromPoint(
          (b.left + b.right) / 2,
          (b.top + b.bottom) / 2
        );
        return Boolean(hit?.closest('#menu'));
      });
    await page.evaluate(() => {
      document.querySelector('#menu').showPopover();
    });
    expect(await menuOnTop()).toBe(true);
    const before = await page.evaluate(
      () => document.querySelector('.mm-notify-list').scrollTop
    );
    expect(before).toBeGreaterThan(0);

    await page.evaluate(() =>
      window.t.toast('The newest.', 'success', { timeoutMs: 0 })
    );
    await expect(page.locator('.mm-notify')).toHaveCount(13);
    await expect(cross).toBeFocused();
    expect(await menuOnTop()).toBe(false);
    // Kept, and moved on by the new message's growth, where scroll anchoring has it.
    expect(
      await page.evaluate(
        () => document.querySelector('.mm-notify-list').scrollTop
      )
    ).toBeGreaterThanOrEqual(before);
  });

  test('the popover opens with the first message and closes after the last', async ({
    page,
  }) => {
    await open(page);
    await page.evaluate(() => window.t.toast('First.', 'alert'));
    await expect(page.locator('.mm-notify')).toBeVisible();
    expect(await page.evaluate(() => window.t.regionOpen())).toBe(true);

    await page.evaluate(() => window.t.toast('Second.', 'alert'));
    await expect(page.locator('.mm-notify')).toHaveCount(2);
    await page.locator('.mm-notify-close').first().click();
    await expect(page.locator('.mm-notify')).toHaveCount(1);
    expect(await page.evaluate(() => window.t.regionOpen())).toBe(true);

    await page.locator('.mm-notify-close').first().click();
    await expect(page.locator('.mm-notify')).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => window.t.regionOpen()))
      .toBe(false);

    // And open again for the next.
    await page.evaluate(() => window.t.toast('Third.', 'alert'));
    await expect(page.locator('.mm-notify')).toBeVisible();
    expect(await page.evaluate(() => window.t.regionOpen())).toBe(true);
  });

  test('messages sit above the sticky header', async ({ page }) => {
    await open(page);
    await page.evaluate(() => window.t.toast('Over it.', 'alert'));
    await expect(page.locator('.mm-notify')).toBeVisible();
    const onTop = await page.evaluate(() => {
      window.t.settle();
      const item = window.t.item('Over it.');
      const box = item.getBoundingClientRect();
      const bar = document.querySelector('.bar').getBoundingClientRect();
      return (
        box.top < bar.bottom &&
        window.t.hits(
          item,
          (box.left + box.right) / 2,
          (box.top + Math.min(box.bottom, bar.bottom)) / 2
        )
      );
    });
    expect(onTop).toBe(true);
  });
});
