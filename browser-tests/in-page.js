/**
 * Added to every page before its own scripts, as an init script: what the tests call
 * inside the browser. It imports the same `dist` file as the page, so they share one
 * module and one state. The time of an animation is set by hand: nothing here waits.
 */
window.t = {
  // An absolute URL: WebKit resolves a path against Playwright's own script here.
  load: () => import(new URL('/dist/esm/index.js', location.href).href),

  async toast(text, kind, options) {
    (await this.load()).toast(text, kind, options);
  },

  async configure(options) {
    (await this.load()).configure(options);
  },

  /** A message by its text (the newest of those). */
  item(text) {
    return [...document.querySelectorAll('.mm-notify')].find(
      (item) => item.querySelector('p').textContent === text
    );
  },

  /** What a test compares: where it is, and the parts of its height. */
  box(element) {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      height: rect.height,
      content: parseFloat(style.height),
      paddingTop: parseFloat(style.paddingTop),
      paddingBottom: parseFloat(style.paddingBottom),
      marginBottom: parseFloat(style.marginBottom),
      opacity: parseFloat(style.opacity),
    };
  },

  boxOf(text) {
    const item = this.item(text);
    return item ? this.box(item) : null;
  },

  clearAll() {
    return document.querySelector('.mm-notify-clear');
  },

  /** Takes over the animations of a message or button, and returns what they animate. */
  hold(element) {
    const animations = element.getAnimations({ subtree: true });
    for (const animation of animations) animation.pause();
    return animations.map((animation) => ({
      name: animation.animationName ?? animation.transitionProperty,
      duration: animation.effect.getComputedTiming().duration,
      target: animation.effect.target.tagName.toLowerCase(),
    }));
  },

  /** Clicks the cross and takes over at once: the transitions run in real time otherwise. */
  closeHeld(text) {
    const item = this.item(text);
    item.querySelector('.mm-notify-close').click();
    return this.hold(item);
  },

  /**
   * From now on, every new message is held from the frame it arrives in, whatever the
   * time a test takes to look at it. Mutation records come right after that frame.
   */
  holdArrivals() {
    new MutationObserver((records) => {
      for (const { addedNodes } of records)
        for (const node of addedNodes)
          if (node.classList?.contains('mm-notify')) this.hold(node);
    }).observe(document.documentElement, { childList: true, subtree: true });
  },

  /** Sets the time of everything held on it. */
  step(element, ms) {
    for (const animation of element.getAnimations({ subtree: true })) {
      animation.pause();
      animation.currentTime = ms;
    }
  },

  /** Shows a message and takes over what that does to clear all, in the same task. */
  async toastHoldClear(text) {
    await this.toast(text, 'neutral', { timeoutMs: 0 });
    return this.hold(this.clearAll());
  },

  /**
   * Closes a message in real time and measures in the same task as its removal: where the
   * neighbour is just before and just after, so frames in between don't count as a jump.
   */
  closeAndWatchRemoval(text, neighbourText) {
    const item = this.item(text);
    const neighbour = this.item(neighbourText);
    return new Promise((resolve) => {
      const frames = [];
      const top = () => neighbour.getBoundingClientRect().top;
      const remove = item.remove.bind(item);
      let result;
      item.remove = () => {
        const before = top();
        remove();
        result = { jump: Math.abs(top() - before) };
      };
      const frame = () => {
        frames.push({ at: performance.now(), top: top() });
        if (frames.length === 3) item.querySelector('.mm-notify-close').click();
        if (result) resolve({ ...result, frames });
        else requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
  },

  /** Ends the growth of the messages only. */
  settleMessages() {
    for (const item of document.querySelectorAll('.mm-notify'))
      for (const animation of item.getAnimations()) animation.finish();
  },

  /** Ends whatever still moves, to measure the page at rest. */
  settle() {
    for (const animation of document.getAnimations()) animation.finish();
  },

  regionOpen() {
    const region = document.querySelector('.mm-notify-region');
    return Boolean(region?.matches(':popover-open'));
  },

  /** Does this point hit the element, or something inside it? */
  hits(element, x, y) {
    const hit = document.elementFromPoint(x, y);
    return Boolean(hit && element.contains(hit));
  },
};
