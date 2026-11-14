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

// Work in the background: the handle `toast()` returns. The server pretends to work
// (examples/jobs.js); the package itself has no network code.
const wait = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const on = (selector, run) => {
  document.querySelector(selector).addEventListener('click', () => {
    void run().catch((error) => {
      show(`The example failed: ${error.message}`, 'error');
    });
  });
};

const startJob = async (ms) => {
  const answer = await fetch(`/api/jobs?ms=${ms}`, { method: 'POST' });
  return (await answer.json()).id;
};

// A progress bar, polled: the bar holds the message until the outcome replaces it.
on('#poll', async () => {
  const { toast } = await notify();
  const job = toast('Exporting your orders…').progress(0);
  try {
    const id = await startJob(8000);
    // Closed by the reader: nothing more to show, stop asking.
    while (!job.closed) {
      const answer = await fetch(`/api/jobs/${id}`);
      if (!answer.ok) throw new Error(answer.statusText);
      const state = await answer.json();
      if (state.finished) {
        job.replace(`Exported ${state.total} files.`, 'success');
        return;
      }
      job
        .update(`Exporting your orders: ${state.done} of ${state.total} files…`)
        .progress(state.progress, `${state.done} of ${state.total} files`);
      await wait(400);
    }
  } catch {
    // A bar waits for its outcome: a failure is one too, or the bar stays up.
    job.replace('The export stopped. Please try again.', 'error');
  }
});

// Console-like lines, pushed by the server. The log stays with the outcome.
on('#stream', async () => {
  const { toast } = await notify();
  const job = toast('Deploying the release…').progress(true);
  const source = new EventSource(`/api/jobs/${await startJob(6000)}/log`);
  void job.whenClosed.then(() => {
    source.close();
  });
  source.addEventListener('message', (event) => {
    job.log(event.data);
  });
  source.addEventListener('done', () => {
    source.close();
    job.progress(false).update('Deployed.', 'success', { timeoutMs: 15_000 });
  });
  // A lost connection (it would reconnect) or a refused one (closed already): either
  // way the outcome, or the bar would wait for good. Closed by the page, it sends none.
  source.addEventListener('error', () => {
    source.close();
    job.progress(false).update('The deploy lost its connection.', 'error');
  });
});

// Words that change step by step, silently, then a new kind, read out.
on('#steps', async () => {
  const { toast } = await notify();
  const job = toast('Step 1 of 3: checking your VAT number…', 'neutral', {
    timeoutMs: 0,
  });
  await wait(1500);
  job.update('Step 2 of 3: saving your address…');
  await wait(1500);
  job.update('Step 3 of 3: sending the invoice…');
  await wait(1500);
  job.update('Your invoice is on its way.', 'success');
});

// The aesweets D49 pattern: a progress message only past 2 s, then the outcome.
const status = document.querySelector('#status');

async function request(ms, fails) {
  status.textContent = 'Saving…';
  const { toast } = await notify();
  let job;
  const slow = setTimeout(() => {
    // The status line says "Saving…" already: not read out twice.
    job = toast('Still saving…', 'neutral', { announce: false });
    job.progress(true);
  }, 2000);
  let [text, kind] =
    fails ?
      ['Saving failed. Please try again.', 'error']
    : ['Saved.', 'success'];
  try {
    await fetch(`/api/slow?ms=${ms}`);
  } catch {
    [text, kind] = ['The server is not reachable. Please try again.', 'error'];
  } finally {
    // Whatever happens: a "Still saving…" that comes after the answer would stay up.
    clearTimeout(slow);
  }
  status.textContent = text;
  // The same message becomes the outcome, read out now; a new one if there was
  // none, or if the reader closed it meanwhile.
  if (job && !job.closed) job.replace(text, kind);
  else toast(text, kind);
}

on('#slow', () => request(4000, false));
on('#fast', () => request(500, false));
on('#failing', () => request(4000, true));

// A site sets this once, before the first message: here to try both.
document.querySelector('#repeats').addEventListener('change', (event) => {
  void notify().then(({ configure }) => {
    configure({ repeats: event.target.checked });
  });
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
    show(`Permanent message ${number}.`, 'alert', { timeoutMs: 0 });
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
  show('Second, stays until closed.', 'error', { timeoutMs: 0 });
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
