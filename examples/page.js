/**
 * The example page. Only the eager check is imported up front, as a site would
 * do it; the rest comes with the first message.
 */
import { hasFlash } from '/dist/esm/has-flash.js';

const loaded = document.querySelector('#loaded');

/** The recommended use: the module arrives on first use, with its CSS. */
const notify = () =>
  import('/dist/esm/index.js').then((module) => {
    loaded.textContent = 'loaded';
    return module;
  });

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

// What a browser without popover does: `showPopover` is missing and the
// selector is a SyntaxError. The one thing a simulation can't take away is the
// browser's own rule hiding a closed `[popover]`, hence `.no-popover` in page.css.
const older = document.querySelector('#older');
if (new URLSearchParams(location.search).has('no-popover')) {
  document.documentElement.classList.add('no-popover');
  delete HTMLElement.prototype.showPopover;
  delete HTMLElement.prototype.hidePopover;
  const matches = Element.prototype.matches;
  Element.prototype.matches = function (selector) {
    if (selector === ':popover-open')
      throw new DOMException(`'${selector}' is not valid`, 'SyntaxError');
    return matches.call(this, selector);
  };
  older.textContent = 'Back to the current browser';
  older.href = '?';
}
