import type { DrumVoice, SoundPresetMap, Step, StepLength, TrackKind } from "../domain/types";

export interface TrackChannelRecipe {
  highpass: number;
  eq: { low: number; mid: number; high: number; lowFrequency: number; highFrequency: number };
  compressor: { attack: number; release: number };
  delayTime: string;
  reverb: { decay: number; preDelay: number };
  duckDb: number;
}

export const TRACK_CHANNEL_RECIPES: Record<TrackKind, TrackChannelRecipe> = {
  drums: {
    highpass: 24,
    eq: { low: 1.25, mid: -0.6, high: 0.35, lowFrequency: 105, highFrequency: 6_800 },
    compressor: { attack: 0.012, release: 0.105 },
    delayTime: "16n",
    reverb: { decay: 0.72, preDelay: 0.008 },
    duckDb: 0,
  },
  acid: {
    highpass: 32,
    eq: { low: 0.7, mid: 1.1, high: -0.45, lowFrequency: 115, highFrequency: 4_800 },
    compressor: { attack: 0.008, release: 0.09 },
    delayTime: "8n",
    reverb: { decay: 1.15, preDelay: 0.014 },
    duckDb: -4.5,
  },
  stab: {
    highpass: 118,
    eq: { low: -1.8, mid: 0.9, high: 0.5, lowFrequency: 180, highFrequency: 5_600 },
    compressor: { attack: 0.006, release: 0.13 },
    delayTime: "8n.",
    reverb: { decay: 1.65, preDelay: 0.019 },
    duckDb: -6,
  },
  rave: {
    highpass: 96,
    eq: { low: -1.2, mid: 0.7, high: 0.65, lowFrequency: 165, highFrequency: 5_900 },
    compressor: { attack: 0.009, release: 0.15 },
    delayTime: "8n",
    reverb: { decay: 1.9, preDelay: 0.024 },
    duckDb: -5,
  },
  texture: {
    highpass: 138,
    eq: { low: -2.2, mid: -0.2, high: 1.1, lowFrequency: 210, highFrequency: 6_400 },
    compressor: { attack: 0.018, release: 0.24 },
    delayTime: "4n",
    reverb: { decay: 3.4, preDelay: 0.032 },
    duckDb: -3.5,
  },
};

export const TRACK_TIMING_OFFSETS_MS: Record<Exclude<TrackKind, "drums">, number> = {
  acid: 0,
  stab: 5,
  rave: 2,
  texture: 8,
};

export const DRUM_TIMING_OFFSETS_MS: Record<DrumVoice, number> = {
  kick: 0,
  snare: 8,
  clap: 8,
  closedHat: 3,
  openHat: 6,
  tom: 5,
  ride: 4,
};

export const DUCK_ATTACK_SECONDS = 0.004;
export const DUCK_HOLD_SECONDS = 0.012;

export interface DuckEnvelope {
  gain: number;
  attack: number;
  hold: number;
  release: number;
  end: number;
}

export function duckEnvelope(track: TrackKind, tempo: number): DuckEnvelope {
  const release = 30 / clamp(tempo, 40, 300);
  const duckDb = TRACK_CHANNEL_RECIPES[track].duckDb;
  return {
    gain: dbToGain(duckDb),
    attack: DUCK_ATTACK_SECONDS,
    hold: DUCK_HOLD_SECONDS,
    release,
    end: DUCK_ATTACK_SECONDS + DUCK_HOLD_SECONDS + release,
  };
}

/** Persisted 0..1 values stay untouched; only their audible interpretation changes. */
export function faderGain(value: number): number {
  const safe = Number.isFinite(value) ? clamp(value, 0, 1) : 0;
  return safe * safe;
}

export function dbMeterValue(db: number): number {
  return clamp((finite(db, -60) + 60) / 60, 0, 1);
}

export function rmsToDb(rms: number): number {
  return rms > 0 && Number.isFinite(rms) ? Math.max(-120, 20 * Math.log10(rms)) : -120;
}

export function positionalVelocity(bar: number, step: number): number {
  const position = Math.max(0, Math.round(bar)) * 16 + Math.max(0, Math.round(step));
  const cycle = [-0.04, 0.02, -0.01, 0.05, -0.025, 0.01, -0.055, 0.035] as const;
  return 1 + cycle[position % cycle.length]!;
}

export function performanceOffsetSeconds(track: TrackKind, drumVoice?: DrumVoice): number {
  const milliseconds = track === "drums"
    ? DRUM_TIMING_OFFSETS_MS[drumVoice ?? "kick"]
    : TRACK_TIMING_OFFSETS_MS[track];
  return milliseconds / 1_000;
}

export function riserDurationSeconds(length: StepLength, tempo: number): number {
  const beat = 60 / clamp(tempo, 40, 300);
  return length === "short" ? beat : length === "long" ? beat * 4 : beat * 2;
}

export function stepDurationSeconds(length: StepLength, tempo: number): number {
  const sixteenth = 15 / clamp(tempo, 40, 300);
  return length === "short" ? sixteenth * 0.5 : length === "long" ? sixteenth * 2 : sixteenth;
}

export interface AcidLegatoContext {
  legato: boolean;
  continues: boolean;
}

export function acidLegatoContext(
  bars: readonly { steps: readonly Step[] }[],
  bar: number,
  step: number,
  loopSteps = bars.length * 16,
): AcidLegatoContext {
  const currentIndex = bar * 16 + step;
  const current = stepAt(bars, currentIndex);
  const previous = currentIndex > 0 ? stepAt(bars, currentIndex - 1) : undefined;
  const next = currentIndex < Math.min(loopSteps, bars.length * 16) - 1 ? stepAt(bars, currentIndex + 1) : undefined;
  return {
    legato: Boolean(current?.enabled && current.slide && previous?.enabled),
    continues: Boolean(current?.enabled && next?.enabled && next.slide),
  };
}

export function stabVoicing(preset: SoundPresetMap["stab"], closeTriad: readonly number[]): number[] {
  const root = closeTriad[0];
  const third = closeTriad[1];
  const fifth = closeTriad[2];
  if (root === undefined || third === undefined || fifth === undefined) return [...closeTriad];
  if (preset === "chord") return [root, fifth, third + 12, root + 24];
  return [root, third, fifth];
}

function stepAt(bars: readonly { steps: readonly Step[] }[], index: number): Step | undefined {
  const bar = Math.floor(index / 16);
  return bars[bar]?.steps[index % 16];
}

function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Tone's MembraneSynth starts a note at `note × octaves` and falls to the note;
 * Klangwerk's OneShotTone starts at `note × 2^octaves`. Kitty's recipes keep
 * Tone's meaning, so they pass through here.
 */
export function membraneOctaves(multiplier: number): number {
  return Math.log2(Math.max(1, multiplier));
}

/**
 * A kick tuned to the key: the root or its fifth, in whichever octave lies
 * nearest the preset's centre, so the kick sits with the bass instead of
 * under it. Without a key it plays the centre itself.
 */
export function kickFrequency(rootMidi: number | undefined, centerHz: number): number {
  if (rootMidi === undefined || !Number.isFinite(rootMidi)) return centerHz;
  const pitchClass = ((Math.round(rootMidi) % 12) + 12) % 12;
  let best = centerHz;
  let distance = Number.POSITIVE_INFINITY;
  for (const pitch of [pitchClass, (pitchClass + 7) % 12]) {
    for (let octave = 0; octave <= 3; octave += 1) {
      const hertz = 440 * 2 ** ((12 + octave * 12 + pitch - 69) / 12);
      const away = Math.abs(Math.log2(hertz / centerHz));
      if (away < distance) {
        distance = away;
        best = hertz;
      }
    }
  }
  return best;
}

/**
 * The 303's accent sweep: every accent charges a capacitor that bends the
 * cutoff up and drains slowly, so accents close together climb on each other
 * (the "wow" of an acid line), and the charge rises smoothly, so the peak
 * comes a moment after the note. The resonance knob deepens it.
 */
export const ACCENT_SWEEP_RISE_SECONDS = 0.016;
export const ACCENT_SWEEP_DECAY_SECONDS = 0.2;
/** The highest the sweep climbs, in octaves above the cutoff. */
export const ACCENT_SWEEP_CEILING_OCTAVES = 1.4;
/** After three time constants the rise counts as done and the drain begins. */
export const ACCENT_SWEEP_RISE_END = 3 * ACCENT_SWEEP_RISE_SECONDS;

/** One accent's charge: it rises from `from` towards `peak` (octaves) from `time` on. */
export interface AccentSweep {
  time: number;
  from: number;
  peak: number;
}

/** How deep one accent sweeps (octaves): `base`, plus `resonance` with the resonance fully up. */
export interface AccentSweepDepth {
  base: number;
  resonance: number;
}

/** Where the sweep stands at `time`, in octaves. */
export function accentSweepAt(sweep: AccentSweep | null, time: number): number {
  if (!sweep) return 0;
  const elapsed = time - sweep.time;
  if (!(elapsed > 0)) return sweep.from;
  const rising = (seconds: number) => sweep.peak + (sweep.from - sweep.peak) * Math.exp(-seconds / ACCENT_SWEEP_RISE_SECONDS);
  if (elapsed < ACCENT_SWEEP_RISE_END) return rising(elapsed);
  return rising(ACCENT_SWEEP_RISE_END) * Math.exp(-(elapsed - ACCENT_SWEEP_RISE_END) / ACCENT_SWEEP_DECAY_SECONDS);
}

/** An accent at `time` charges on top of what the last ones left; `resonance` runs from 0 to 1. */
export function chargeAccentSweep(previous: AccentSweep | null, time: number, depth: AccentSweepDepth, resonance: number): AccentSweep {
  const from = accentSweepAt(previous, time);
  const amount = Math.max(0, depth.base + clamp(finite(resonance, 0), 0, 1) * depth.resonance);
  return { time, from, peak: Math.min(ACCENT_SWEEP_CEILING_OCTAVES, from + amount) };
}
