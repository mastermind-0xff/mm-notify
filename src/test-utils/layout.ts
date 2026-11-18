/**
 * happy-dom has no layout, so this counts what a browser would have to do instead:
 * a read of a layout value (`scrollHeight`, `getBoundingClientRect`, a computed
 * style, setting `scrollTop`) after a change to the page since the last read or
 * frame forces a layout there and then. A `MutationObserver` tells the changes
 * (its records are taken synchronously at each read). An attribute set to the value
 * it had is no change: browsers skip it (happy-dom records a `classList.toggle`
 * that changes nothing, which browsers don't).
 */

export interface LayoutCount {
  /** Layout reads in all. */
  reads: number;
  /** Reads that came after a change: each a layout the browser does at once. */
  forced: number;
  /** Changes to the page (mutation records). */
  writes: number;
  /** The browser's own layout at the end of a frame: changes before it cost nothing more. */
  frame: () => void;
  undo: () => void;
}

export function countLayouts(): LayoutCount {
  const observer = new MutationObserver(() => undefined);
  observer.observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
    attributeOldValue: true,
  });
  const changes = (): number =>
    observer
      .takeRecords()
      .filter(
        ({ type, target, attributeName, oldValue }) =>
          type !== 'attributes' ||
          (target as Element).getAttribute(attributeName!) !== oldValue
      ).length;
  const count: LayoutCount = {
    reads: 0,
    forced: 0,
    writes: 0,
    frame: () => {
      count.writes += changes();
    },
    undo: () => {
      observer.disconnect();
      for (const restore of undos) restore();
    },
  };
  const read = (): void => {
    const changed = changes();
    count.writes += changed;
    count.reads++;
    if (changed) count.forced++;
  };
  const undos: (() => void)[] = [];
  const wrap = (
    target: object,
    name: string,
    kind: 'get' | 'set' | 'value'
  ): void => {
    const descriptor = Object.getOwnPropertyDescriptor(target, name)!;
    // Any accessor or method, called with its own `this` below.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type, @typescript-eslint/unbound-method
    const original = descriptor[kind] as Function;
    Object.defineProperty(target, name, {
      ...descriptor,
      [kind](this: unknown, ...args: unknown[]): unknown {
        read();
        return original.apply(this, args);
      },
    });
    undos.push(() => {
      Object.defineProperty(target, name, descriptor);
    });
  };
  const owner = (name: string): object => {
    let target: object | null = HTMLElement.prototype;
    while (target && !Object.hasOwn(target, name))
      target = Object.getPrototypeOf(target) as object | null;
    return target!;
  };
  for (const name of ['scrollHeight', 'clientHeight', 'scrollTop'])
    wrap(owner(name), name, 'get');
  wrap(owner('scrollTop'), 'scrollTop', 'set');
  wrap(owner('getBoundingClientRect'), 'getBoundingClientRect', 'value');
  // The page's own `getComputedStyle` is the global one (vitest copies the window's).
  const computed = Object.getOwnPropertyDescriptor(
    globalThis,
    'getComputedStyle'
  )!;
  const getComputedStyle = globalThis.getComputedStyle.bind(globalThis);
  globalThis.getComputedStyle = (element: Element) => {
    read();
    return getComputedStyle(element);
  };
  undos.push(() => {
    Object.defineProperty(globalThis, 'getComputedStyle', computed);
  });
  return count;
}
