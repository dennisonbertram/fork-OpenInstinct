import "@testing-library/jest-dom";

// jsdom has no ResizeObserver; AI Elements' Conversation component
// (use-stick-to-bottom) reads it on mount. A no-op stub is enough for tests
// that render Conversation without asserting on scroll behavior.
if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver =
    ResizeObserverStub as unknown as typeof ResizeObserver;
}
