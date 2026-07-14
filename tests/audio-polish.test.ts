import { describe, expect, it } from "vitest";
import {
  acidLegatoContext,
  dbMeterValue,
  DRUM_TIMING_OFFSETS_MS,
  duckEnvelope,
  faderGain,
  positionalVelocity,
  riserDurationSeconds,
  stabVoicing,
  TRACK_CHANNEL_RECIPES,
  TRACK_TIMING_OFFSETS_MS,
} from "@/audio/polish";
import { emptyStep } from "@/domain/patterns";
import { safeEffectParameters } from "@/domain/sound-presets";
import { SOUND_PRESETS, TRACK_KINDS, type Step, type TrackMacros } from "@/domain/types";
import { createFactoryProject } from "@/domain/defaults";
import { effectiveTrackGains } from "@/store/store";
import { saturationGainCompensation, saturationSample } from "@/audio/graph";
import { VOICE_LIMITS } from "@/audio/engine";

describe("Sound-Polish-Verträge", () => {
  it("bildet gespeicherte Fader quadratisch und unverändert begrenzt ab", () => {
    expect([0, 0.25, 0.5, 0.75, 1].map(faderGain)).toEqual([0, 0.0625, 0.25, 0.5625, 1]);
    expect(faderGain(Number.NaN)).toBe(0);
    const project = createFactoryProject();
    project.mix[0]!.volume = 0.5;
    expect(effectiveTrackGains(project).drums).toBe(0.25);
    expect(dbMeterValue(-60)).toBe(0);
    expect(dbMeterValue(-30)).toBe(0.5);
    expect(dbMeterValue(0)).toBe(1);
  });

  it("liefert exakte, tempoabhängige Ducking-Hüllkurven für alle Returns", () => {
    const expectedDb = { acid: -4.5, stab: -6, rave: -5, texture: -3.5 } as const;
    for (const track of ["acid", "stab", "rave", "texture"] as const) {
      const envelope = duckEnvelope(track, 150);
      expect(envelope.attack).toBe(0.004);
      expect(envelope.hold).toBe(0.012);
      expect(envelope.release).toBeCloseTo(0.2, 8);
      expect(envelope.gain).toBeCloseTo(Math.pow(10, expectedDb[track] / 20), 8);
      expect(TRACK_CHANNEL_RECIPES[track].duckDb).toBe(expectedDb[track]);
    }
    expect(duckEnvelope("acid", 120).release).toBeCloseTo(0.25, 8);
    expect(duckEnvelope("acid", 180).release).toBeCloseTo(1 / 6, 8);
  });

  it("hält die festen Performance-Offsets ohne Zufallsdrift fest", () => {
    expect(TRACK_TIMING_OFFSETS_MS).toEqual({ acid: 0, rave: 2, stab: 5, texture: 8 });
    expect(DRUM_TIMING_OFFSETS_MS).toEqual({ kick: 0, closedHat: 3, tom: 5, openHat: 6, snare: 8, clap: 8 });
    for (let bar = 0; bar < 4; bar += 1) {
      for (let step = 0; step < 16; step += 1) {
        expect(Math.abs(positionalVelocity(bar, step) - 1)).toBeLessThanOrEqual(0.06);
        expect(positionalVelocity(bar, step)).toBe(positionalVelocity(bar, step));
      }
    }
  });

  it("behält die vereinbarten Voice-Limits bei", () => {
    expect(VOICE_LIMITS).toEqual({ drums: 6, acid: 1, stab: 4, rave: 5, texture: 2 });
  });

  it("formt Chord offen und lässt Beton und Flash als enge Dreiklänge", () => {
    expect(stabVoicing("concrete", [48, 51, 55])).toEqual([48, 51, 55]);
    expect(stabVoicing("flash", [48, 51, 55])).toEqual([48, 51, 55]);
    expect(stabVoicing("chord", [48, 51, 55])).toEqual([48, 55, 63, 72]);
  });

  it("verbindet Slide nur mit direkt benachbarten Acid-Steps, auch über Taktgrenzen", () => {
    const bars = Array.from({ length: 2 }, () => ({ steps: Array.from({ length: 16 }, () => emptyStep()) }));
    bars[0]!.steps[14] = enabledStep(false);
    bars[0]!.steps[15] = enabledStep(true);
    bars[1]!.steps[0] = enabledStep(true);
    bars[1]!.steps[1] = enabledStep(false);
    expect(acidLegatoContext(bars, 0, 14)).toEqual({ legato: false, continues: true });
    expect(acidLegatoContext(bars, 0, 15)).toEqual({ legato: true, continues: true });
    expect(acidLegatoContext(bars, 1, 0)).toEqual({ legato: true, continues: false });
    expect(acidLegatoContext(bars, 1, 1)).toEqual({ legato: false, continues: false });
    expect(acidLegatoContext([{ steps: bars[1]!.steps }], 0, 0).legato).toBe(false);
  });

  it("macht Riser exakt ein, zwei oder vier Beats lang", () => {
    expect(riserDurationSeconds("short", 120)).toBe(0.5);
    expect(riserDurationSeconds("normal", 120)).toBe(1);
    expect(riserDurationSeconds("long", 120)).toBe(2);
    expect(riserDurationSeconds("short", 180)).toBeCloseTo(1 / 3, 8);
    expect(riserDurationSeconds("normal", 180)).toBeCloseTo(2 / 3, 8);
    expect(riserDurationSeconds("long", 180)).toBeCloseTo(4 / 3, 8);
  });

  it("hält alle musikalischen Makroziele monoton", () => {
    const low: TrackMacros = { color: 0, pressure: 0, space: 0, motion: 0, density: 0 };
    const high: TrackMacros = { color: 1, pressure: 1, space: 1, motion: 1, density: 1 };
    for (const track of TRACK_KINDS) {
      for (const preset of SOUND_PRESETS[track]) {
        const a = safeEffectParameters(track, preset, low);
        const b = safeEffectParameters(track, preset, high);
        expect(b.cutoff).toBeGreaterThanOrEqual(a.cutoff);
        expect(b.q).toBeGreaterThanOrEqual(a.q);
        expect(b.ratio).toBeGreaterThanOrEqual(a.ratio);
        expect(b.saturation).toBeGreaterThanOrEqual(a.saturation);
        expect(b.delayWet).toBeGreaterThanOrEqual(a.delayWet);
        expect(b.reverbWet).toBeGreaterThanOrEqual(a.reverbWet);
        expect(b.feedback).toBeGreaterThanOrEqual(a.feedback);
      }
    }
  });

  it("verwendet drei DC-sichere, monotone Saturation-Kennlinien mit Pegelkompensation", () => {
    for (const curve of ["body", "bite", "density"] as const) {
      expect(saturationSample(curve, 0)).toBe(0);
      let previous = saturationSample(curve, -1);
      for (let index = 1; index <= 100; index += 1) {
        const input = -1 + index / 50;
        const value = saturationSample(curve, input);
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(previous);
        expect(value).toBeCloseTo(-saturationSample(curve, -input), 10);
        previous = value;
      }
      expect(saturationGainCompensation(curve, 0)).toBe(1);
      expect(saturationGainCompensation(curve, 1)).toBeLessThan(saturationGainCompensation(curve, 0.5));
      expect(saturationGainCompensation(curve, Number.NaN)).toBe(1);
    }
  });
});

function enabledStep(slide: boolean): Step {
  return { ...emptyStep(), enabled: true, degree: 0, octave: 2, dynamics: "normal", length: "normal", slide };
}
