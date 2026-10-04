import { describe, expect, it } from "vitest";
import {
  acidLegatoContext,
  dbMeterValue,
  DRUM_TIMING_OFFSETS_MS,
  duckEnvelope,
  faderGain,
  kickFrequency,
  membraneOctaves,
  positionalVelocity,
  riserDurationSeconds,
  stabVoicing,
  TRACK_CHANNEL_RECIPES,
  TRACK_TIMING_OFFSETS_MS,
} from "@/audio/polish";
import { emptyStep } from "@/domain/patterns";
import { ACID_ENVELOPE_CEILING, acidCutoff, acidEnvelopeOctaves, presetDefinition, safeEffectParameters } from "@/domain/sound-presets";
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
    expect(DRUM_TIMING_OFFSETS_MS).toEqual({ kick: 0, closedHat: 3, ride: 4, tom: 5, openHat: 6, snare: 8, clap: 8 });
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

describe("Klangüberarbeitung", () => {
  it("stimmt die Kick auf Grundton oder Quinte nahe der Preset-Mitte", () => {
    const a1 = 55;
    // A-Moll: die Kick sitzt auf dem Grundton A1.
    expect(kickFrequency(33, a1)).toBeCloseTo(55, 5);
    // F: F1 liegt näher an 49 Hz als C2.
    expect(kickFrequency(29, 49)).toBeCloseTo(43.654, 2);
    // C: C1 wäre zu tief, die Quinte G1 trifft die Mitte.
    expect(kickFrequency(24, 49)).toBeCloseTo(48.999, 2);
    // Die Oktave des Grundtons spielt keine Rolle, ohne Tonart bleibt die Mitte.
    expect(kickFrequency(57, 49)).toBeCloseTo(kickFrequency(33, 49), 5);
    expect(kickFrequency(undefined, 49)).toBe(49);
    for (let root = 0; root < 12; root += 1) {
      const hertz = kickFrequency(24 + root, 49);
      expect(hertz).toBeGreaterThan(40);
      expect(hertz).toBeLessThan(62);
    }
  });

  it("übersetzt Tones MembraneSynth-Faktor in echte Oktaven", () => {
    expect(membraneOctaves(4.5)).toBeCloseTo(Math.log2(4.5), 10);
    expect(membraneOctaves(1)).toBe(0);
    expect(membraneOctaves(0.5)).toBe(0);
    // Warehouse beginnt den Sweep bei G1 · 4,5 ≈ 220 Hz, nicht bei 49 Hz · 2^4,5.
    const kick = presetDefinition("drums", "warehouse").synthesis.kick;
    expect(49 * 2 ** membraneOctaves(kick.octaves)).toBeLessThan(260);
  });

  it("macht die Farbe der 303 zum Cutoff-Regler und begrenzt die Hüllkurvenspitze", () => {
    for (const preset of SOUND_PRESETS.acid) {
      const recipe = presetDefinition("acid", preset).synthesis;
      expect(acidCutoff(preset, 0)).toBeCloseTo(recipe.filterBase, 5);
      expect(acidCutoff(preset, 1)).toBeCloseTo(recipe.filterBase * 2 ** recipe.cutoffOctaves, 5);
      let previous = 0;
      for (let color = 0; color <= 1; color += 0.1) {
        const cutoff = acidCutoff(preset, color);
        expect(cutoff).toBeGreaterThan(previous);
        previous = cutoff;
        for (const boost of [1, recipe.accent.filterBoost]) {
          expect(cutoff * 2 ** acidEnvelopeOctaves(preset, cutoff, boost)).toBeLessThanOrEqual(ACID_ENVELOPE_CEILING + 1e-6);
        }
      }
      // Bei Werksfarbe steht der Cutoff über 300 Hz, statt unter 200 Hz zu kleben.
      expect(acidCutoff(preset, 0.64)).toBeGreaterThan(300);
    }
  });
});

describe("303-Verzerrer", () => {
  it("clippt asymmetrisch, monoton und bleibt in ±1", async () => {
    const { driveSample, driveCompensation } = await import("@/audio/distortion");
    let previous = -Infinity;
    for (let value = -1; value <= 1; value += 0.01) {
      const sample = driveSample(value);
      expect(sample).toBeGreaterThanOrEqual(previous);
      expect(Math.abs(sample)).toBeLessThanOrEqual(1);
      previous = sample;
    }
    expect(driveSample(0)).toBe(0);
    expect(Math.abs(driveSample(-1))).toBeLessThan(driveSample(1));
    for (let amount = 0; amount <= 1; amount += 0.1) expect(driveCompensation(amount)).toBeGreaterThan(0);
    // More drive needs less make-up gain.
    expect(driveCompensation(1)).toBeLessThan(driveCompensation(0));
  });

  it("fährt den Verzerrer mit Druck und Akzent hoch, begrenzt", async () => {
    const { acidDrive, SOUND_SAFETY_LIMITS } = await import("@/domain/sound-presets");
    for (const preset of SOUND_PRESETS.acid) {
      expect(acidDrive(preset, 1)).toBeGreaterThan(acidDrive(preset, 0));
      expect(acidDrive(preset, 0.5, true)).toBeGreaterThan(acidDrive(preset, 0.5));
      expect(acidDrive(preset, 1, true)).toBeLessThanOrEqual(SOUND_SAFETY_LIMITS.drive);
    }
    // Venom bites hardest, Rubber stays round.
    expect(acidDrive("venom", 0.5)).toBeGreaterThan(acidDrive("silverbox", 0.5));
    expect(acidDrive("rubber", 0.5)).toBeLessThan(acidDrive("silverbox", 0.5));
  });
});

describe("Diode-Ladder des 303", () => {
  const SAMPLE_RATE = 44_100;

  async function kernel() {
    const { LADDER_KERNEL_SOURCE } = await import("@/audio/ladder");
    const Kernel = new Function(`${LADDER_KERNEL_SOURCE}; return DiodeLadderKernel;`)() as new (rate: number) => {
      process(input: number, cutoff: number, k: number): number;
      settle(): void;
    };
    return () => new Kernel(SAMPLE_RATE);
  }

  /** Gain in dB of a quiet sine through the ladder, after it settled. */
  function sineGain(create: () => { process(input: number, cutoff: number, k: number): number }, hertz: number, cutoff: number, k: number): number {
    const ladder = create();
    const frames = Math.round(SAMPLE_RATE * 0.4);
    let output = 0;
    let input = 0;
    for (let index = 0; index < frames; index += 1) {
      const x = 0.001 * Math.sin((2 * Math.PI * hertz * index) / SAMPLE_RATE);
      const y = ladder.process(x, cutoff, k);
      if (index > frames / 2) {
        output += y * y;
        input += x * x;
      }
    }
    return 10 * Math.log10(output / input);
  }

  it("lässt den Bass durch und fällt oberhalb des Cutoffs steil ab", async () => {
    const create = await kernel();
    expect(Math.abs(sineGain(create, 40, 2_000, 0))).toBeLessThan(1);
    expect(sineGain(create, 8_000, 1_000, 0)).toBeLessThan(-40);
  });

  it("hebt mit Resonanz einen Peak über das ausgedünnte Band darunter", async () => {
    const create = await kernel();
    const scooped = sineGain(create, 300, 1_000, 15);
    const peak = Math.max(...[900, 1_000, 1_100, 1_200, 1_300].map((hertz) => sineGain(create, hertz, 1_000, 15)));
    expect(peak - scooped).toBeGreaterThan(12);
    // Without feedback there is no peak at all.
    expect(sineGain(create, 1_100, 1_000, 0)).toBeLessThan(sineGain(create, 300, 1_000, 0));
  });

  it("bleibt bei wilden Eingaben, Cutoffs und voller Resonanz endlich und begrenzt", async () => {
    const create = await kernel();
    const ladder = create();
    let state = 7;
    const random = () => {
      state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
      return state / 4_294_967_296;
    };
    let peak = 0;
    for (let index = 0; index < SAMPLE_RATE * 2; index += 1) {
      const cutoff = random() < 0.01 ? Number.NaN : random() * 40_000;
      const y = ladder.process((random() * 2 - 1) * 6, cutoff, 16.4);
      expect(Number.isFinite(y)).toBe(true);
      peak = Math.max(peak, Math.abs(y));
      if (index % 128 === 0) ladder.settle();
    }
    expect(peak).toBeLessThan(6);
  });

  it("bildet die Resonanz knapp unter die Selbstoszillation ab, steigend und sicher", async () => {
    const { ladderFeedback, ladderResonance, LADDER_SELF_OSCILLATION } = await import("@/audio/ladder");
    expect(ladderFeedback(0.5)).toBe(0);
    expect(ladderFeedback(Number.NaN)).toBe(0);
    let previous = -1;
    for (let q = 0.5; q <= 12; q += 0.25) {
      expect(ladderFeedback(q)).toBeGreaterThanOrEqual(previous);
      expect(ladderFeedback(q)).toBeLessThan(LADDER_SELF_OSCILLATION);
      previous = ladderFeedback(q);
    }
    expect(ladderResonance(9)).toBe(1);
    // The knob's middle already sits well into the squelch.
    expect(ladderResonance(4.75)).toBeGreaterThan(0.7);
  });
});

describe("Akzent-Sweep des 303", () => {
  const depth = { base: 0.32, resonance: 0.5 };

  it("steigt sanft an und fließt danach langsam ab", async () => {
    const { accentSweepAt, chargeAccentSweep, ACCENT_SWEEP_RISE_END } = await import("@/audio/polish");
    expect(accentSweepAt(null, 3)).toBe(0);
    const sweep = chargeAccentSweep(null, 1, depth, 0);
    expect(sweep).toEqual({ time: 1, from: 0, peak: 0.32 });
    // The peak comes a moment after the note.
    expect(accentSweepAt(sweep, 1.005)).toBeGreaterThan(0);
    expect(accentSweepAt(sweep, 1.005)).toBeLessThan(accentSweepAt(sweep, 1 + ACCENT_SWEEP_RISE_END));
    expect(accentSweepAt(sweep, 1.2)).toBeLessThan(accentSweepAt(sweep, 1.1));
    expect(accentSweepAt(sweep, 3)).toBeLessThan(0.001);
  });

  it("lässt dicht folgende Akzente aufeinander klettern, bis zur Decke", async () => {
    const { chargeAccentSweep, ACCENT_SWEEP_CEILING_OCTAVES } = await import("@/audio/polish");
    const sixteenth = 15 / 140;
    let sweep = chargeAccentSweep(null, 0, depth, 0.5);
    const peaks = [sweep.peak];
    for (let index = 1; index < 8; index += 1) {
      sweep = chargeAccentSweep(sweep, index * sixteenth, depth, 0.5);
      peaks.push(sweep.peak);
    }
    expect(peaks[1]!).toBeGreaterThan(peaks[0]!);
    expect(peaks[2]!).toBeGreaterThan(peaks[1]!);
    expect(Math.max(...peaks)).toBeLessThanOrEqual(ACCENT_SWEEP_CEILING_OCTAVES);
    // After a long rest an accent starts from scratch.
    expect(chargeAccentSweep(sweep, 10, depth, 0.5).peak).toBeCloseTo(peaks[0]!, 3);
  });

  it("schwingt mit mehr Resonanz tiefer, je nach Preset", async () => {
    const { chargeAccentSweep } = await import("@/audio/polish");
    expect(chargeAccentSweep(null, 0, depth, 1).peak).toBeGreaterThan(chargeAccentSweep(null, 0, depth, 0).peak);
    expect(chargeAccentSweep(null, 0, depth, Number.NaN).peak).toBe(depth.base);
    const sweeps = Object.fromEntries(SOUND_PRESETS.acid.map((preset) => [preset, presetDefinition("acid", preset).synthesis.accentSweep]));
    expect(sweeps.venom!.base).toBeGreaterThan(sweeps.silverbox!.base);
    expect(sweeps.rubber!.base).toBeLessThan(sweeps.silverbox!.base);
  });
});

describe("Kick-Rumble", () => {
  function fakeContext(sampleRate = 44_100) {
    return {
      sampleRate,
      createBuffer: (_channels: number, length: number) => {
        const data = new Float32Array(length);
        return { length, getChannelData: () => data };
      },
    } as unknown as BaseAudioContext;
  }

  it("baut einen reproduzierbaren, dunklen Hall mit Einheitsverstärkung im Kick-Band", async () => {
    const { rumbleImpulse } = await import("@/audio/rumble");
    const first = rumbleImpulse(fakeContext(), 1.1).getChannelData(0);
    const again = rumbleImpulse(fakeContext(), 1.1).getChannelData(0);
    expect(first.length).toBe(Math.round(1.1 * 44_100));
    expect(Array.from(again.subarray(0, 4_000))).toEqual(Array.from(first.subarray(0, 4_000)));
    expect(first.every(Number.isFinite)).toBe(true);
    // A 60 Hz sine through the hall comes out at about its own level.
    const gain = (hertz: number) => {
      let re = 0;
      let im = 0;
      first.forEach((value, index) => {
        re += value * Math.cos((2 * Math.PI * hertz * index) / 44_100);
        im -= value * Math.sin((2 * Math.PI * hertz * index) / 44_100);
      });
      return Math.hypot(re, im);
    };
    const low = Math.sqrt([45, 60, 75, 90, 105].reduce((sum, hertz) => sum + gain(hertz) ** 2, 0) / 5);
    expect(low).toBeGreaterThan(0.5);
    expect(low).toBeLessThan(2);
    // Dark: far less above 2 kHz.
    const high = Math.sqrt([2_000, 3_000, 4_000].reduce((sum, hertz) => sum + gain(hertz) ** 2, 0) / 3);
    expect(high).toBeLessThan(low / 30);
    // It dies away: the last tenth holds next to nothing.
    const energy = (values: Float32Array) => values.reduce((sum, value) => sum + value * value, 0);
    expect(energy(first.subarray(Math.floor(first.length * 0.9)))).toBeLessThan(energy(first) * 1e-4);
  });

  it("schickt mehr Kick in den Hall, je mehr Raum, und hat in jedem Preset einen", async () => {
    const { kickRumbleSend } = await import("@/domain/sound-presets");
    for (const preset of SOUND_PRESETS.drums) {
      const rumble = presetDefinition("drums", preset).synthesis.kick.rumble;
      expect(rumble.level).toBeGreaterThan(0);
      expect(kickRumbleSend(preset, 0.5)).toBeCloseTo(rumble.level, 6);
      expect(kickRumbleSend(preset, 1)).toBeGreaterThan(kickRumbleSend(preset, 0));
      expect(kickRumbleSend(preset, Number.NaN)).toBeCloseTo(rumble.level * 0.5, 6);
    }
    // Rumble rumbles most, Stahl least.
    expect(kickRumbleSend("rumble", 0.5)).toBeGreaterThan(kickRumbleSend("warehouse", 0.5));
    expect(kickRumbleSend("steel", 0.5)).toBeLessThan(kickRumbleSend("warehouse", 0.5));
  });
});
