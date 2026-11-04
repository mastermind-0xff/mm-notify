/**
 * The design tool (`npm run examples`, then design.html). It changes the look of
 * real messages through what a site would set, the `--notify-*` custom properties
 * and `configure`, and exports only what differs from the defaults: as CSS, as
 * settings, or as a brief for an agent to set the design.
 *
 * The defaults are read from the package (`dist/notify.css`, `config`), never
 * repeated here, so they can't go stale. What has no custom property goes into CSS
 * rules more specific than the package's own, so the package pays nothing for it.
 *
 * DOM APIs only, like the package: the server sends a strict CSP.
 */
import { config } from '/dist/esm/config.js';
import { configure, toast } from '/dist/esm/index.js';

const KINDS = ['success', 'error', 'alert', 'neutral'];
const STORE = 'mm-notify.design';
const MINIMUM_CONTRAST = 4.5;

const SAMPLES = {
  success: 'You are logged in.',
  error: 'That did not work. Please try again.',
  alert: 'Your session ends in five minutes.',
  neutral: 'A new version is available.',
};

const PLACES = {
  'top-center': 'Top center',
  'top-right': 'Top right',
  'top-left': 'Top left',
  'bottom-center': 'Bottom center',
  'bottom-right': 'Bottom right',
  'bottom-left': 'Bottom left',
};

const $ = (selector) => document.querySelector(selector);

function h(tag, properties = {}, ...children) {
  const element = Object.assign(document.createElement(tag), properties);
  element.append(...children);
  return element;
}

// ---- The defaults, from the package ----------------------------------------

const source = (await (await fetch('/dist/notify.css')).text()).replaceAll(
  /\/\*[\s\S]*?\*\//g,
  ''
);

/** Every `var(--notify-x, default)`, with parentheses inside the default. */
function tokenDefaults() {
  const found = {};
  for (const match of source.matchAll(/var\((--notify-[\w-]+),\s*/g)) {
    const start = match.index + match[0].length;
    let end = start;
    for (let depth = 1; depth > 0; end += 1) {
      if (source[end] === '(') depth += 1;
      if (source[end] === ')') depth -= 1;
    }
    found[match[1]] = source
      .slice(start, end - 1)
      .replaceAll(/\s+/g, ' ')
      .trim();
  }
  return found;
}

function declarations(selector) {
  const block = source.split(`${selector} {`)[1]?.split('}')[0] ?? '';
  return Object.fromEntries(
    block
      .split(';')
      .map((line) => line.split(':'))
      .filter((pair) => pair.length === 2)
      .map(([name, value]) => [name.trim(), value.trim()])
  );
}

const fullHex = (color) =>
  color.length === 4 ?
    `#${[...color.slice(1)].map((digit) => digit + digit).join('')}`
  : color;

const toHex = (...channels) =>
  `#${channels.map((channel) => Number(channel).toString(16).padStart(2, '0')).join('')}`;

const fromHex = (hex) =>
  [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));

const TOKENS = tokenDefaults();
const MESSAGE = declarations('.mm-notify');
const [paddingBlock, paddingRight, , paddingLeft] = MESSAGE.padding
  .split(' ')
  .map(Number.parseFloat);
const [, glowY, glowBlur] = /0 (\d+)px (\d+)px/
  .exec(declarations('.mm-notify-success')['box-shadow'])
  .map(Number);

function kindDefaults() {
  const found = {};
  for (const kind of KINDS) {
    const [, red, green, blue, alpha] =
      /rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\)/.exec(
        TOKENS[`--notify-${kind}-glow`]
      );
    found[`background-${kind}`] = fullHex(TOKENS[`--notify-${kind}`]);
    found[`glow-${kind}`] = toHex(red, green, blue);
    found[`strength-${kind}`] = Math.round(alpha * 100);
    found[`seconds-${kind}`] = config.durations[kind] / 1000;
  }
  return found;
}

const DEFAULTS = {
  place: 'top-center',
  edge: Number.parseFloat(TOKENS['--notify-top']),
  side: 1,
  width: Number(/min\(([\d.]+)rem/.exec(TOKENS['--notify-width'])[1]),
  text: fullHex(TOKENS['--notify-color']),
  glowFollows: true,
  radius: Number.parseFloat(TOKENS['--notify-radius']),
  fontSize: Number.parseFloat(TOKENS['--notify-font-size']),
  fontWeight: Number(MESSAGE['font-weight']),
  lineHeight: Number(MESSAGE['line-height']),
  paddingBlock,
  paddingLeft,
  gap: Number.parseFloat(MESSAGE.gap),
  spacing: Number.parseFloat(MESSAGE['margin-bottom']),
  border: 0,
  borderColor: '#000000',
  icons: true,
  glowY,
  glowBlur,
  clearBackground: fullHex(TOKENS['--notify-clear']),
  clearText: fullHex(TOKENS['--notify-clear-color']),
  clearAlign: 'center',
  ...kindDefaults(),
  sequential: config.sequential,
  clearAllFrom: config.clearAllFrom,
  clearAllLabel: config.clearAllLabel,
  closeLabel: config.closeLabel,
  pageColor: '#fafafa', // of this page only: not part of the design
};

function loadSaved() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE)) ?? {};
    return Object.fromEntries(
      Object.entries(saved).filter(
        ([key, value]) => typeof value === typeof DEFAULTS[key]
      )
    );
  } catch {
    return {};
  }
}

const values = { ...DEFAULTS, ...loadSaved() };

// ---- From the values to what a site sets ------------------------------------

const length = (value, unit) => (value ? `${value}${unit}` : '0');

function tokensOf(v) {
  const bottom = v.place.startsWith('bottom');
  const center = v.place.endsWith('center');
  const left = v.place.endsWith('left');
  const tokens = {
    '--notify-top': bottom ? 'auto' : length(v.edge, 'rem'),
    '--notify-right': center || left ? 'auto' : length(v.side, 'rem'),
    '--notify-bottom': bottom ? length(v.edge, 'rem') : 'auto',
    '--notify-left':
      center ? '50%'
      : left ? length(v.side, 'rem')
      : 'auto',
    '--notify-shift': center ? '-50%' : '0',
    '--notify-slide': bottom ? '1.25rem' : '-1.25rem',
    '--notify-clear-order': bottom ? '-1' : '0',
    '--notify-width': `min(${v.width}rem, calc(100vw - 2rem))`,
    // Bottom: the messages keep 2rem of their own below. Clear all stays on screen.
    '--notify-max-height': `calc(100dvh - ${v.edge + (bottom ? 2 : 1)}rem)`,
    '--notify-color': v.text,
    '--notify-radius': length(v.radius, 'px'),
    '--notify-font-size': `${v.fontSize}rem`,
    '--notify-clear': v.clearBackground,
    '--notify-clear-color': v.clearText,
  };
  for (const kind of KINDS) {
    const channels = fromHex(v[`glow-${kind}`]).join(' ');
    tokens[`--notify-${kind}`] = v[`background-${kind}`];
    tokens[`--notify-${kind}-glow`] =
      `rgb(${channels} / ${v[`strength-${kind}`] / 100})`;
  }
  return tokens;
}

function rulesOf(v) {
  const rules = {
    // Not while closing: its padding and margin have to collapse.
    '.mm-notify-region .mm-notify:not(.mm-notify-out)': {
      padding: `${v.paddingBlock}rem ${paddingRight}rem ${v.paddingBlock}rem ${v.paddingLeft}rem`,
      gap: length(v.gap, 'rem'),
      'margin-bottom': length(v.spacing, 'rem'),
      'font-weight': String(v.fontWeight),
      'line-height': String(v.lineHeight),
      border: v.border ? `${v.border}px solid ${v.borderColor}` : 'none',
    },
    '.mm-notify-region .mm-notify svg': v.icons ? {} : { display: 'none' },
    '.mm-notify-region .mm-notify-clear': {
      'margin-inline': { left: '0 auto', center: 'auto', right: 'auto 0' }[
        v.clearAlign
      ],
    },
  };
  for (const kind of KINDS) {
    const token = `--notify-${kind}-glow`;
    rules[`.mm-notify-region .mm-notify-${kind}`] = {
      'box-shadow': `0 ${length(v.glowY, 'px')} ${length(v.glowBlur, 'px')} var(${token}, ${TOKENS[token]})`,
    };
  }
  return rules;
}

function settingsOf(v) {
  return {
    closeLabel: v.closeLabel,
    clearAllLabel: v.clearAllLabel,
    clearAllFrom: v.clearAllFrom || Infinity,
    durations: Object.fromEntries(
      KINDS.map((kind) => [kind, Math.round(v[`seconds-${kind}`] * 1000)])
    ),
    sequential: v.sequential,
  };
}

const differing = (now, before) =>
  Object.fromEntries(
    Object.entries(now).filter(([key, value]) => value !== before[key])
  );

/** The rules with only the declarations that differ, none where nothing does. */
function rulesDiffering(now, before) {
  return Object.fromEntries(
    Object.entries(now)
      .map(([selector, rule]) => [selector, differing(rule, before[selector])])
      .filter(([, rule]) => Object.keys(rule).length > 0)
  );
}

function settingsDiffering(now, before) {
  const durations = differing(now.durations, before.durations);
  const rest = differing(
    { ...now, durations: undefined },
    { ...before, durations: undefined }
  );
  return Object.keys(durations).length > 0 ? { ...rest, durations } : rest;
}

const BASE = {
  tokens: tokensOf(DEFAULTS),
  rules: rulesOf(DEFAULTS),
  settings: settingsOf(DEFAULTS),
};

const design = () => ({
  tokens: differing(tokensOf(values), BASE.tokens),
  rules: rulesDiffering(rulesOf(values), BASE.rules),
  settings: settingsDiffering(settingsOf(values), BASE.settings),
});

// ---- Contrast ---------------------------------------------------------------

function luminance(hex) {
  const [red, green, blue] = fromHex(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(one, other) {
  const [dark, light] = [luminance(one), luminance(other)].sort(
    (a, b) => a - b
  );
  return (light + 0.05) / (dark + 0.05);
}

const contrasts = () => [
  ...KINDS.map((kind) => [
    kind,
    contrast(values.text, values[`background-${kind}`]),
  ]),
  ['clear all', contrast(values.clearText, values.clearBackground)],
];

// ---- The exports ------------------------------------------------------------

const lines = (rule) =>
  Object.entries(rule)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join('\n');

function cssOf({ tokens, rules }) {
  const parts = Object.entries(rules).map(
    ([selector, rule]) => `${selector} {\n${lines(rule)}\n}`
  );
  if (Object.keys(tokens).length > 0)
    parts.unshift(`:root {\n${lines(tokens)}\n}`);
  return parts.join('\n\n');
}

/** `Infinity` is no JSON: a string there, the number again in JS. */
const withInfinity = (_key, value) => (value === Infinity ? 'Infinity' : value);

function settingsCall(settings) {
  const object = JSON.stringify(settings, withInfinity, 2)
    .replaceAll('"Infinity"', 'Infinity')
    .replaceAll(/"(\w+)":/g, '$1:');
  return `import { configure } from '@mmutils/notify';\n\nconfigure(${object});`;
}

function exportCss() {
  const css = cssOf(design());
  return css ?
      `/* @mmutils/notify: the design, in the site's own stylesheet. */\n${css}\n`
    : '/* The look is the package default: nothing to set. */\n';
}

function exportJson() {
  const { tokens, rules, settings } = design();
  return `${JSON.stringify(
    { package: '@mmutils/notify', tokens, rules, configure: settings },
    withInfinity,
    2
  )}\n`;
}

function exportBrief() {
  const { tokens, rules, settings } = design();
  const css = cssOf({ tokens, rules });
  const low = contrasts().filter(([, ratio]) => ratio < MINIMUM_CONTRAST);
  const fence = (language, code) => `\`\`\`${language}\n${code}\n\`\`\``;
  const sections = [
    `# Set the design of the notifications (\`@mmutils/notify\`)

This design was made and approved in the package's design tool. Apply exactly this:
what isn't listed keeps the package's default. Don't adjust values, don't add others.
The package's README explains the custom properties and \`configure\`.`,
  ];
  if (css)
    sections.push(`## CSS

Into the site's own stylesheet, not inline in a page: the package exists so that pages
carry none of this. Custom properties on \`:root\` win in any cascade order, and the
rules are more specific than the package's own, so the order doesn't matter.

${fence('css', css)}`);
  if (Object.keys(settings).length > 0)
    sections.push(`## Settings

Once, before the first message, in the small module the site imports instead of the
package (README, "configure"). Keep the site's own options, such as \`injectCss\`.

${fence('js', settingsCall(settings))}`);
  if (!css && Object.keys(settings).length === 0)
    sections.push('## Nothing to set\n\nAll of it is the package default.');
  sections.push(`## Contrast

Text on its background, at least ${MINIMUM_CONTRAST}:1 wanted:

${contrasts()
  .map(
    ([name, ratio]) =>
      `- ${name}: ${ratio.toFixed(1)}:1${ratio < MINIMUM_CONTRAST ? ' **(too low)**' : ''}`
  )
  .join('\n')}${
    low.length > 0 ?
      `\n\nThis was approved with ${low.map(([name]) => name).join(', ')} too low. Say so when you hand back the work.`
    : ''
  }`);
  sections.push(`## When it is done

- Show all four kinds and three or more messages at once (clear all), at a wide and a
  phone width, and compare with the design tool.
- Run the project's own checks. If the site has a test of the notification colors, it
  needs the new values.
- Only if you were asked to make this the package's own default rather than a site's:
  change the defaults in \`src/notify.css\` and \`src/config.ts\` instead, then run
  \`npm run check\` and \`npm run size\`. The rules above have no custom property, so they
  would change the base rules there, and the size budget may need a decision.`);
  return `${sections.join('\n\n')}\n`;
}

const FORMATS = {
  brief: { make: exportBrief, file: 'notify-design.md' },
  css: { make: exportCss, file: 'notify-design.css' },
  json: { make: exportJson, file: 'notify-design.json' },
};

const format = () => FORMATS[$('[name="format"]:checked').value];

// ---- Showing it -------------------------------------------------------------

const extraRules = new CSSStyleSheet();
document.adoptedStyleSheets = [...document.adoptedStyleSheets, extraRules];

function apply() {
  const { tokens, rules } = design();
  const root = document.documentElement;
  for (const name of Object.keys(BASE.tokens)) root.style.removeProperty(name);
  for (const [name, value] of Object.entries(tokens))
    root.style.setProperty(name, value);
  extraRules.replaceSync(cssOf({ tokens: {}, rules }));
  configure(settingsOf(values));
  const button = $('.mm-notify-clear');
  if (button) button.textContent = values.clearAllLabel;

  root.dataset.dock = values.place.endsWith('left') ? 'right' : 'left';
  const page = $('#page');
  page.style.background = values.pageColor;
  page.classList.toggle('dark', luminance(values.pageColor) < 0.2);

  $('#output').value = format().make();
  localStorage.setItem(STORE, JSON.stringify(differing(values, DEFAULTS)));
}

const closeAll = () => {
  for (const button of document.querySelectorAll('.mm-notify-close'))
    button.click();
};

const showPinned = () => {
  for (const kind of KINDS) toast(SAMPLES[kind], kind, { timeoutMs: 0 });
};

const PREVIEWS = {
  'All kinds, pinned': showPinned,
  'With their timers'() {
    for (const kind of KINDS) toast(SAMPLES[kind], kind);
  },
  'Three of 3 s'() {
    for (const number of ['First', 'Second', 'Third'])
      toast(`${number}, 3 s.`, 'success', { timeoutMs: 3000 });
  },
  'A long one'() {
    toast(
      'Logged in as a.rather.long.address.for.a.phone@subdomain.example-company.com. A message of two or three lines, to see the line height and the spacing.',
      'neutral',
      { timeoutMs: 0 }
    );
  },
  'Twelve, pinned'() {
    for (let number = 1; number <= 12; number += 1)
      toast(`Message ${number}.`, KINDS[number % 4], { timeoutMs: 0 });
  },
  'Close them': closeAll,
};

// ---- The controls -----------------------------------------------------------

/** What brings the controls in line with `values`, after a change or a reset. */
const syncs = [];

/** The values before a reset, until the next change: no dialog, one click back. */
let undo;

function refresh() {
  for (const sync of syncs) sync();
  apply();
}

function changed(key) {
  if (key.startsWith('background-') && values.glowFollows)
    values[key.replace('background-', 'glow-')] = values[key];
  // The edge means something else there: the messages have 2rem of their own at the bottom.
  if (key === 'place' && values.place.startsWith('bottom') && values.edge === 1)
    values.edge = 0;
  if (key === 'place' && values.place.startsWith('top') && values.edge === 0)
    values.edge = 1;
  // A site sets this once. Here it changes while messages are up, and those waiting
  // would keep waiting: start clean.
  if (key === 'sequential') closeAll();
  $('#reset').textContent = 'Back to the defaults';
  undo = undefined;
  refresh();
}

function bind(input, key, property = 'value', read = (value) => value) {
  syncs.push(() => {
    if (input[property] !== values[key]) input[property] = values[key];
  });
  input.addEventListener('input', () => {
    values[key] = read(input[property]);
    changed(key);
  });
  return input;
}

const row = (label, control, ...after) =>
  h('label', { className: 'control' }, label, control, ...after);

function slider(key, label, min, max, step, unit) {
  const output = h('output');
  syncs.push(() => {
    output.textContent = `${values[key]}${unit}`;
  });
  const input = h('input', { type: 'range', min, max, step });
  syncs.push(() => {
    input.valueAsNumber = values[key];
  });
  input.addEventListener('input', () => {
    values[key] = input.valueAsNumber;
    changed(key);
  });
  return row(label, input, output);
}

const color = (key, label) =>
  row(label, bind(h('input', { type: 'color' }), key));

const check = (key, label) =>
  row(label, bind(h('input', { type: 'checkbox' }), key, 'checked'));

const text = (key, label) =>
  row(label, bind(h('input', { type: 'text' }), key));

const number = (key, label, min, step, note) =>
  row(
    label,
    bind(
      h('input', { type: 'number', min, step }),
      key,
      'valueAsNumber',
      (value) => (Number.isNaN(value) ? 0 : Math.max(min, value))
    ),
    h('span', { className: 'heads', textContent: note })
  );

function choice(key, label, options) {
  const select = h(
    'select',
    {},
    ...Object.entries(options).map(([value, name]) =>
      h('option', { value, textContent: name })
    )
  );
  return row(label, bind(select, key));
}

function kindRow(kind) {
  const ratio = h('output', { className: 'contrast' });
  syncs.push(() => {
    const value = contrast(values.text, values[`background-${kind}`]);
    ratio.textContent = `${value.toFixed(1)}:1`;
    ratio.classList.toggle('low', value < MINIMUM_CONTRAST);
  });
  const strength = h('input', {
    type: 'range',
    min: 0,
    max: 100,
    step: 1,
    ariaLabel: `Glow strength of ${kind}`,
  });
  syncs.push(() => {
    strength.valueAsNumber = values[`strength-${kind}`];
  });
  strength.addEventListener('input', () => {
    values[`strength-${kind}`] = strength.valueAsNumber;
    changed(`strength-${kind}`);
  });
  return h(
    'div',
    { className: 'kind' },
    kind,
    bind(
      h('input', { type: 'color', ariaLabel: `Background of ${kind}` }),
      `background-${kind}`
    ),
    bind(
      h('input', { type: 'color', ariaLabel: `Glow color of ${kind}` }),
      `glow-${kind}`
    ),
    strength,
    ratio
  );
}

const group = (title, ...children) =>
  h('fieldset', {}, h('legend', { textContent: title }), ...children);

const previewButtons = Object.entries(PREVIEWS).map(([label, show]) => {
  const button = h('button', { type: 'button', textContent: label });
  button.addEventListener('click', show);
  return button;
});

$('#controls').append(
  group('Show', h('div', { className: 'row' }, ...previewButtons)),
  group(
    'Position',
    choice('place', 'Where', PLACES),
    slider('edge', 'From top or bottom', 0, 12, 0.25, 'rem'),
    slider('side', 'From the side', 0, 8, 0.25, 'rem'),
    slider('width', 'Width', 16, 48, 1, 'rem')
  ),
  group(
    'Colors',
    color('text', 'Text'),
    check('glowFollows', 'Glow follows the color'),
    h(
      'div',
      { className: 'kind heads' },
      ...['Kind', 'Color', 'Glow', 'Strength', 'Contrast'].map((textContent) =>
        h('span', { textContent })
      )
    ),
    ...KINDS.map(kindRow)
  ),
  group(
    'Shape and type',
    slider('radius', 'Corner radius', 0, 32, 1, 'px'),
    slider('fontSize', 'Font size', 0.75, 1.5, 0.0625, 'rem'),
    slider('fontWeight', 'Font weight', 300, 700, 100, ''),
    slider('lineHeight', 'Line height', 1.1, 2, 0.05, ''),
    slider('paddingBlock', 'Padding, vertical', 0.25, 2, 0.125, 'rem'),
    slider('paddingLeft', 'Padding, left', 0.25, 2, 0.125, 'rem'),
    slider('gap', 'Icon to text', 0, 2, 0.125, 'rem'),
    slider('spacing', 'Between messages', 0, 2, 0.125, 'rem'),
    slider('border', 'Border', 0, 6, 1, 'px'),
    color('borderColor', 'Border color'),
    check('icons', 'Icons')
  ),
  group(
    'Glow',
    slider('glowY', 'Downwards', 0, 32, 1, 'px'),
    slider('glowBlur', 'Blur', 0, 48, 1, 'px')
  ),
  group(
    'Clear all',
    color('clearBackground', 'Background'),
    color('clearText', 'Text'),
    choice('clearAlign', 'Align', {
      left: 'Left',
      center: 'Center',
      right: 'Right',
    }),
    number('clearAllFrom', 'From how many', 0, 1, '0: never'),
    text('clearAllLabel', 'Label')
  ),
  group(
    'Behavior',
    ...KINDS.map((kind) =>
      number(`seconds-${kind}`, `Seconds, ${kind}`, 0, 0.5, '0: stays')
    ),
    check('sequential', 'One after the other'),
    text('closeLabel', 'Close button, read out')
  ),
  group('The page behind', color('pageColor', 'Page color'))
);

// A token in the package's CSS that nothing here sets: the tool is behind.
const unknown = Object.keys(TOKENS).filter((name) => !(name in BASE.tokens));
const broken = Object.keys(DEFAULTS).filter((key) =>
  Number.isNaN(DEFAULTS[key])
);
if (unknown.length > 0 || broken.length > 0)
  $('#warnings').append(
    h('p', {
      textContent: `The package's CSS has changed, update examples/design.js. No control for: ${[...unknown, ...broken].join(', ')}.`,
    })
  );

// ---- The export buttons -----------------------------------------------------

for (const radio of document.querySelectorAll('[name="format"]'))
  radio.addEventListener('change', apply);

const say = (message) => {
  $('#done').textContent = message;
};

$('#copy').addEventListener('click', async () => {
  $('#output').select();
  try {
    await navigator.clipboard.writeText($('#output').value);
    say('Copied.');
  } catch {
    say('Selected: press Ctrl+C.');
  }
});

$('#download').addEventListener('click', () => {
  const { make, file } = format();
  const url = URL.createObjectURL(new Blob([make()], { type: 'text/plain' }));
  h('a', { href: url, download: file }).click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
  say(`Downloaded ${file}.`);
});

$('#reset').addEventListener('click', () => {
  const previous = undo;
  undo = previous ? undefined : { ...values };
  Object.assign(values, previous ?? DEFAULTS);
  $('#reset').textContent = previous ? 'Back to the defaults' : 'Undo';
  say(previous ? 'Your design is back.' : 'The defaults.');
  refresh();
});

refresh();
showPinned();
