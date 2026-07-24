import '@testing-library/jest-dom/vitest';

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

class PointerEventMock extends MouseEvent {
  pointerId: number;

  constructor(type: string, eventInit: PointerEventInit = {}) {
    super(type, eventInit);
    this.pointerId = eventInit.pointerId ?? 0;
  }
}

globalThis.ResizeObserver = ResizeObserverMock;
globalThis.PointerEvent ??= PointerEventMock as typeof PointerEvent;
globalThis.crypto.randomUUID ??= () => '00000000-0000-4000-8000-000000000000';
window.matchMedia ??= (query: string) =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }) as MediaQueryList;
Element.prototype.scrollIntoView ??= () => undefined;
