import { renderAudioAcceptanceSuite, type OfflineAudioAcceptanceSuite } from "./engine";

export interface KittyAudioTestApi {
  renderSuite(): Promise<OfflineAudioAcceptanceSuite>;
}

export function installAudioTestApi(): void {
  const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(window.location.hostname);
  if (!local || new URLSearchParams(window.location.search).get("audio-test") !== "1") return;
  window.__kittyAudioTest = { renderSuite: renderAudioAcceptanceSuite };
  document.documentElement.dataset.audioTest = "ready";
}
