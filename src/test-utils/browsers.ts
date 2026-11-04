/**
 * happy-dom has no popover. `currentBrowser` adds what browsers since 2024
 * have, `olderBrowser` makes it behave like the ones before: `togglePopover` is
 * missing and the selector is a SyntaxError. Both return a function that undoes
 * them.
 */

type Undo = () => void;

function answerPopoverOpen(answer: (element: Element) => boolean): Undo {
  // eslint-disable-next-line @typescript-eslint/unbound-method -- called with `this` below
  const original = Element.prototype.matches;
  Element.prototype.matches = function (this: Element, selector: string) {
    return selector === ':popover-open' ?
        answer(this)
      : original.call(this, selector);
  } as Element['matches'];
  return () => {
    Element.prototype.matches = original;
  };
}

export function currentBrowser(): Undo {
  const open = new WeakSet<Element>();
  const undo = answerPopoverOpen((element) => open.has(element));
  HTMLElement.prototype.togglePopover = function (
    this: HTMLElement,
    force?: boolean | TogglePopoverOptions
  ) {
    if (!this.isConnected)
      throw new DOMException('Not allowed', 'InvalidStateError');
    const wanted = typeof force === 'boolean' ? force : !open.has(this);
    if (wanted) open.add(this);
    else open.delete(this);
    return wanted;
  };
  return () => {
    undo();
    Reflect.deleteProperty(HTMLElement.prototype, 'togglePopover');
  };
}

export function olderBrowser(): Undo {
  return answerPopoverOpen(() => {
    throw new DOMException(
      "':popover-open' is not a valid selector",
      'SyntaxError'
    );
  });
}

/** Whether a region is open under `currentBrowser`. */
export function isOpen(element: Element): boolean {
  return element.matches(':popover-open');
}
