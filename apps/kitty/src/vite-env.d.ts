/// <reference types="vite/client" />

import type { KittyAudioTestApi } from "./audio/offline-test";

declare global {
  interface ImportMetaEnv {
    readonly VITE_APP_COMMIT?: string;
    readonly VITE_APP_BUILT_AT?: string;
  }

  interface Window {
    __kittyAudioTest?: KittyAudioTestApi;
  }
}

export {};
