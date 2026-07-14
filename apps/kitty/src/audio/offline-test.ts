import { renderAudioAcceptanceSuite, renderAudioPresetAtLevel, type OfflineAudioAcceptanceSuite, type OfflineAudioMetrics } from "./engine";
import type { SoundPresetId, TrackKind } from "../domain/types";

export interface KittyAudioTestApi {
  renderSuite(): Promise<OfflineAudioAcceptanceSuite>;
  renderPreset(track: TrackKind, preset: SoundPresetId, level?: number): Promise<OfflineAudioMetrics>;
}

export function installAudioTestApi(): void {
  const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(window.location.hostname);
  if (!local || new URLSearchParams(window.location.search).get("audio-test") !== "1") return;
  window.__kittyAudioTest = { renderSuite: renderAudioAcceptanceSuite, renderPreset: renderAudioPresetAtLevel };
  document.documentElement.dataset.audioTest = "ready";
}
