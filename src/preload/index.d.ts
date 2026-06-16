import type { AkDailyApi } from '../shared/types';

declare global {
  interface Window {
    akDaily: AkDailyApi;
  }
}

export {};
