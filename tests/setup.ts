import '@testing-library/jest-dom/vitest';

class ResizeObserverStub {
  constructor(_callback: ResizeObserverCallback) {}

  disconnect(): void {}

  observe(_target: Element, _options?: ResizeObserverOptions): void {}

  unobserve(_target: Element): void {}
}

globalThis.ResizeObserver = ResizeObserverStub;
