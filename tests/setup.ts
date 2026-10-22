import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Testing Library's automatic cleanup does not register under the vmForks pool.
afterEach(() => {
  cleanup();
});

class ResizeObserverStub {
  constructor(_callback: ResizeObserverCallback) {}

  disconnect(): void {}

  observe(_target: Element, _options?: ResizeObserverOptions): void {}

  unobserve(_target: Element): void {}
}

globalThis.ResizeObserver = ResizeObserverStub;
