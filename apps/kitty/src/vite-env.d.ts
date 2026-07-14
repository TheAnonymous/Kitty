/// <reference types="vite/client" />

import type { KittyAudioTestApi } from "./audio/offline-test";

declare global {
  interface Window {
    __kittyAudioTest?: KittyAudioTestApi;
  }
}

export {};
