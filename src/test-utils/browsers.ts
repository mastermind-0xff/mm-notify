/**
 * happy-dom has no popover. `currentBrowser` adds what browsers since 2024
 * have, `olderBrowser` makes it behave like the ones before: `showPopover` is
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
  HTMLElement.prototype.showPopover = function (this: HTMLElement) {
    if (!this.isConnected || open.has(this))
      throw new DOMException('Not allowed', 'InvalidStateError');
    open.add(this);
  };
  HTMLElement.prototype.hidePopover = function (this: HTMLElement) {
    if (!open.has(this))
      throw new DOMException('Not allowed', 'InvalidStateError');
    open.delete(this);
  };
  return () => {
    undo();
    Reflect.deleteProperty(HTMLElement.prototype, 'showPopover');
    Reflect.deleteProperty(HTMLElement.prototype, 'hidePopover');
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
