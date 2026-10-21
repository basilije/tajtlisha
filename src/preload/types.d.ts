import type { TajtlishaApi } from '../shared/types/ipc';

declare global {
  interface Window {
    tajtlisha: TajtlishaApi;
  }
}

export {};
