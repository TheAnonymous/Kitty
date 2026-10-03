import { swapSound, useContext } from "klangwerk/tone";
import { renderAudioAcceptanceSuite, renderAudioPresetAtLevel, ToneAudioEngine, type OfflineAudioAcceptanceSuite, type OfflineAudioMetrics } from "./engine";
import { createFactoryProject } from "../domain/defaults";
import type { SoundPresetId, TrackKind } from "../domain/types";

export interface EngineNodeCount {
  total: number;
  constantSources: number;
}

export interface KittyAudioTestApi {
  renderSuite(): Promise<OfflineAudioAcceptanceSuite>;
  renderPreset(track: TrackKind, preset: SoundPresetId, level?: number): Promise<OfflineAudioMetrics>;
  countEngineNodes(): Promise<EngineNodeCount>;
}

/**
 * Counts the native nodes a playing session creates (graph plus every voice
 * bank of the hybrid factory set). Chromium spends audio-thread time on every
 * connected node, so this number is what decides whether playback underruns.
 */
async function countEngineNodes(): Promise<EngineNodeCount> {
  const native = new OfflineAudioContext(2, 44_100, 44_100);
  const counts: Record<string, number> = {};
  for (const key of Object.getOwnPropertyNames(BaseAudioContext.prototype)) {
    if (!key.startsWith("create") || key === "createBuffer" || key === "createPeriodicWave") continue;
    const create = (native as unknown as Record<string, (...args: unknown[]) => unknown>)[key]!.bind(native);
    (native as unknown as Record<string, unknown>)[key] = (...args: unknown[]) => {
      counts[key] = (counts[key] ?? 0) + 1;
      return create(...args);
    };
  }
  const previous = useContext(native);
  const engine = new ToneAudioEngine(createFactoryProject("hybrid"));
  try {
    await engine.prepareAllVoices();
  } finally {
    engine.dispose();
    swapSound(previous);
  }
  return { total: Object.values(counts).reduce((sum, count) => sum + count, 0), constantSources: counts.createConstantSource ?? 0 };
}

export function installAudioTestApi(): void {
  const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(window.location.hostname);
  if (!local || new URLSearchParams(window.location.search).get("audio-test") !== "1") return;
  window.__kittyAudioTest = { renderSuite: renderAudioAcceptanceSuite, renderPreset: renderAudioPresetAtLevel, countEngineNodes };
  document.documentElement.dataset.audioTest = "ready";
}
