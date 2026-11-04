/**
 * The example page. Only the eager check is imported up front, as a site would
 * do it; the rest comes with the first message.
 */
import { hasFlash } from '/dist/esm/has-flash.js';

const loaded = document.querySelector('#loaded');

let loading;

/**
 * The recommended use: the module arrives on first use, with its CSS. One promise:
 * two `import()` calls may resolve in any order while the file is loading, and
 * messages shown together must keep theirs.
 */
const notify = () =>
  (loading ??= import('/dist/esm/index.js').then((module) => {
    loaded.textContent = 'loaded';
    return module;
  }));

const show = (text, kind, options) => {
  void notify().then(({ toast }) => {
    toast(text, kind, options);
  });
};

if (hasFlash()) {
  void notify().then(({ showFlash }) => {
    showFlash();
  });
}

const MESSAGES = {
  success: 'Your changes are saved.',
  error: 'That did not work. Please try again.',
  alert: 'Your session ends in five minutes.',
  neutral: 'A new version is available.',
};

for (const button of document.querySelectorAll('[data-kind]')) {
  button.addEventListener('click', () => {
    show(MESSAGES[button.dataset.kind], button.dataset.kind);
  });
}

document.querySelector('#custom').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  show(form.get('text'), form.get('kind'), {
    ...(form.has('sticky') ? { timeoutMs: 0 } : {}),
    ...(form.has('silent') ? { announce: false } : {}),
  });
});

document.querySelector('#twice').addEventListener('click', () => {
  show('The same text, shown twice.', 'success');
  setTimeout(() => {
    show('The same text, shown twice.', 'success');
  }, 800);
});

document.querySelector('#long').addEventListener('click', () => {
  show(
    'Logged in as a.rather.long.address.for.a.phone@subdomain.example-company.com.',
    'success'
  );
});

document.querySelector('#many').addEventListener('click', () => {
  show('Your changes are saved.', 'success');
  show('That did not work.', 'error');
  show('Your session ends soon.', 'alert');
  show('A new version is available.', 'neutral');
  show(
    'A longer one, to see how a message of two or three lines stacks with the others when the window is narrow.',
    'neutral'
  );
});

document.querySelector('#flood').addEventListener('click', () => {
  for (let number = 1; number <= 30; number += 1)
    show(`Permanent message ${number}.`, 'alert');
});

// A site sets this once, before the first message. Here it changes while messages
// are up, and those waiting would keep waiting: start clean.
document.querySelector('#sequential').addEventListener('change', (event) => {
  document.querySelector('.mm-notify-clear')?.click();
  void notify().then(({ configure }) => {
    configure({ sequential: event.target.checked });
  });
});

document.querySelector('#three').addEventListener('click', () => {
  show('First, 5 s.', 'success');
  show('Second, 5 s.', 'success');
  show('Third, 5 s.', 'success');
});

document.querySelector('#held').addEventListener('click', () => {
  show('First, 5 s.', 'success');
  show('Second, stays until closed.', 'error');
  show(
    'Third, 5 s: when sequential, its time starts after the second.',
    'neutral'
  );
});

// Positions and looks: only an attribute on <html>, the rest is page.css.
const choose = (name, attribute) => {
  for (const radio of document.querySelectorAll(`[name="${name}"]`)) {
    radio.addEventListener('change', () => {
      document.documentElement.dataset[attribute] = radio.value;
      show(`Position and look: ${radio.value || 'the default'}.`, 'neutral');
    });
  }
};
choose('position', 'position');
choose('look', 'look');

for (const button of document.querySelectorAll('[data-flash]')) {
  button.addEventListener('click', () => {
    void notify().then(({ flash }) => {
      flash('This message came across the reload.', button.dataset.flash);
      location.reload();
    });
  });
}

document.querySelector('#broken').addEventListener('click', () => {
  sessionStorage.setItem('mm-notify.flash', '{broken');
  location.reload();
});

// What a browser without popover does: the methods are missing. The region is
// `display: flex` in any browser, so it shows without the top layer here too.
const older = document.querySelector('#older');
if (new URLSearchParams(location.search).has('no-popover')) {
  delete HTMLElement.prototype.togglePopover;
  delete HTMLElement.prototype.showPopover;
  delete HTMLElement.prototype.hidePopover;
  older.textContent = 'Back to the current browser';
  older.href = '?';
}
