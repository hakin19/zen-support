// Web test environment setup for DOM-dependent tests

// Only run in environments that provide a global object
if (typeof globalThis !== 'undefined') {
  // matchMedia mock
  if (typeof (globalThis as any).matchMedia !== 'function') {
    (globalThis as any).matchMedia = (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    });
  }

  // ResizeObserver mock
  if (typeof (globalThis as any).ResizeObserver === 'undefined') {
    (globalThis as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }

  // scrollTo noop
  if (typeof (globalThis as any).scrollTo !== 'function') {
    (globalThis as any).scrollTo = () => {};
  }
}

