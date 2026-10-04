import type { SoundPresetId, SoundPresetMap, TrackKind, TrackMacros } from "./types";

export interface EnvelopeRecipe {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

export interface EffectRecipe {
  filterBase: number;
  filterMin: number;
  filterMax: number;
  resonanceBase: number;
  resonancePressure: number;
  thresholdBase: number;
  thresholdPressure: number;
  ratioBase: number;
  ratioPressure: number;
  delayBase: number;
  delaySpace: number;
  delayMotion: number;
  feedbackBase: number;
  feedbackMotion: number;
  reverbBase: number;
  reverbSpace: number;
  saturationBase: number;
  saturationPressure: number;
}

export type SaturationCurve = "body" | "bite" | "density";
export type FilterCharacter = "warm" | "sharp" | "clean";

export interface PresetChannelRecipe {
  inputTrimDb: number;
  highpass: number;
  eq: { low: number; mid: number; high: number; lowFrequency: number; highFrequency: number; tiltDb: number };
  filterCharacter: FilterCharacter;
  saturationCurve: SaturationCurve;
  compressor: { attack: number; release: number; knee: number };
  outputTrimDb: number;
  delayReturn: { highpass: number; lowpass: number; stereo: boolean };
  reverbReturn: { highpass: number; lowpass: number };
  stereo: { base: number; motion: number };
}

interface PresetRecipeBase<K extends TrackKind> {
  id: SoundPresetMap[K];
  kind: K;
  label: string;
  hint: string;
  level: number;
  envelope: EnvelopeRecipe;
  effects: EffectRecipe;
  channel: PresetChannelRecipe;
}

export interface DrumPresetRecipe extends PresetRecipeBase<"drums"> {
  synthesis: {
    kick: {
      oscillator: "sine" | "triangle";
      /** Where the kick sits; it tunes to the key's root or fifth nearest this note. */
      note: string;
      pitchDecay: number;
      /** As Tone's MembraneSynth: the pitch starts at note × octaves. */
      octaves: number;
      velocity: number;
      transient: number;
      /** A low tail on the kick's own note. */
      subTail?: { decay: number; release: number; cutoff: number; level: number };
      /** The kick sent into a dark hall, pumped by every kick: send level at middle space, hall decay (s), low-pass (Hz). */
      rumble: { level: number; decay: number; cutoff: number };
    };
    snare: { noise: "white" | "pink"; decay: number; bodyNote: string; bodyDecay: number; noiseLevel: number; bodyLevel: number; highpass: number };
    clap: { decay: number; spacing: number; level: number; highpass: number };
    hats: { harmonicity: number; modulationIndex: number; resonance: number; octaves: number; frequency: number; closedDecay: number; openDecay: number; level: number; closedHighpass: number; openHighpass: number };
    tom: { note: string; decay: number; level: number; lowpass: number };
    /** The 909 ride from the hats' metal: longer, a little lower, with a bell band. */
    ride: { decay: number; level: number; highpass: number; bell: number };
  };
}

export interface AcidPresetRecipe extends PresetRecipeBase<"acid"> {
  synthesis: {
    oscillator: "sawtooth" | "square";
    /** The 303's cutoff knob fully down, in hertz. */
    filterBase: number;
    /** How far the cutoff knob (the color macro) opens above `filterBase`, in octaves. */
    cutoffOctaves: number;
    /** Envelope modulation in octaves above the cutoff. */
    filterOctaves: number;
    filterQ: number;
    filterDecay: number;
    filterSustain: number;
    portamento: number;
    slidePortamento: number;
    accent: { filterBoost: number; saturationBoost: number; velocityBoost: number; decayMultiplier: number };
    /** How far one accent sweeps the cutoff up (octaves), plus how much more with the resonance fully up; accents close together climb. */
    accentSweep: { base: number; resonance: number };
    /** The distortion pedal after the 303: drive at pressure 0, how much pressure adds, and its tone low-pass. */
    drive: { base: number; pressure: number; tone: number };
  };
}

export type StabSynthesisRecipe = {
  engine: "analog";
  oscillator: "fatsawtooth";
  unisonCount: number;
  spread: number;
  detune: number;
} | {
  engine: "fm";
  carrier: "sine" | "triangle";
  modulator: "sine" | "square";
  harmonicity: number;
  modulationIndex: number;
  modulationEnvelope: EnvelopeRecipe;
};

export interface StabPresetRecipe extends PresetRecipeBase<"stab"> {
  synthesis: StabSynthesisRecipe;
  voiceFilter: { base: number; octaves: number; attack: number; decay: number; sustain: number; release: number; q: number };
}

export type RaveSynthesisRecipe = {
  engine: "analog";
  oscillator: "fatsawtooth" | "pulse";
  unisonCount: number;
  spread: number;
  pulseWidth?: number;
} | {
  engine: "fm";
  carrier: "sine" | "triangle";
  modulator: "sine" | "square";
  harmonicity: number;
  modulationIndex: number;
  modulationEnvelope: EnvelopeRecipe;
};

export interface RavePresetRecipe extends PresetRecipeBase<"rave"> {
  synthesis: RaveSynthesisRecipe;
  modulation: {
    frequency: number;
    chorusWet: number;
    chorusMotion: number;
    vibratoDepth: number;
    vibratoMotion: number;
  };
}

export type TextureSynthesisRecipe = {
  source: "noise";
  noise: "white" | "pink";
  filterStart: number;
  filterEnd: number;
  sweepSeconds: number;
} | {
  source: "drone";
  unisonCount: number;
  spread: number;
  sawLevel: number;
  sineLevel: number;
  filterFrequency: number;
} | {
  source: "riser";
  noise: "white" | "pink";
  filterStart: number;
  filterEnd: number;
  sweepSeconds: number;
};

export interface TexturePresetRecipe extends PresetRecipeBase<"texture"> {
  synthesis: TextureSynthesisRecipe;
}

export interface PresetRecipeByTrack {
  drums: DrumPresetRecipe;
  acid: AcidPresetRecipe;
  stab: StabPresetRecipe;
  rave: RavePresetRecipe;
  texture: TexturePresetRecipe;
}

export type SoundPresetRecipe = PresetRecipeByTrack[TrackKind];
type SoundPresetCatalog = { [K in TrackKind]: readonly PresetRecipeByTrack[K][] };

export const SOUND_SAFETY_LIMITS = {
  cutoff: { min: 180, max: 13_000 },
  resonance: { acid: 9, other: 3.2 },
  compressionRatio: 4.5,
  feedback: 0.32,
  wet: 0.46,
  saturation: 0.32,
  drive: 0.85,
} as const;

const DEFAULT_EFFECTS: EffectRecipe = {
  filterBase: 5_800,
  filterMin: 0.58,
  filterMax: 1.34,
  resonanceBase: 0.8,
  resonancePressure: 2.1,
  thresholdBase: -8,
  thresholdPressure: 12,
  ratioBase: 1.3,
  ratioPressure: 3.2,
  delayBase: 0,
  delaySpace: 0.2,
  delayMotion: 0.08,
  feedbackBase: 0.08,
  feedbackMotion: 0.24,
  reverbBase: 0,
  reverbSpace: 0.28,
  saturationBase: 0.035,
  saturationPressure: 0.18,
};

function effects(overrides: Partial<EffectRecipe>): EffectRecipe {
  return { ...DEFAULT_EFFECTS, ...overrides };
}

const CHANNEL_DEFAULTS: Record<TrackKind, PresetChannelRecipe> = {
  drums: {
    inputTrimDb: -1.2, highpass: 24,
    eq: { low: 1.25, mid: -0.6, high: 0.35, lowFrequency: 105, highFrequency: 6_800, tiltDb: 1.1 },
    filterCharacter: "warm", saturationCurve: "body", compressor: { attack: 0.012, release: 0.105, knee: 6 }, outputTrimDb: 0.8,
    delayReturn: { highpass: 620, lowpass: 7_600, stereo: false }, reverbReturn: { highpass: 420, lowpass: 8_200 }, stereo: { base: 0, motion: 0 },
  },
  acid: {
    inputTrimDb: -1.6, highpass: 32,
    eq: { low: 0.7, mid: 1.1, high: -0.45, lowFrequency: 115, highFrequency: 4_800, tiltDb: 1.35 },
    filterCharacter: "sharp", saturationCurve: "bite", compressor: { attack: 0.008, release: 0.09, knee: 6 }, outputTrimDb: 0.4,
    delayReturn: { highpass: 260, lowpass: 6_400, stereo: false }, reverbReturn: { highpass: 310, lowpass: 6_800 }, stereo: { base: 0, motion: 0 },
  },
  stab: {
    inputTrimDb: -0.6, highpass: 118,
    eq: { low: -1.8, mid: 0.9, high: 0.5, lowFrequency: 180, highFrequency: 5_600, tiltDb: 1.5 },
    filterCharacter: "warm", saturationCurve: "body", compressor: { attack: 0.006, release: 0.13, knee: 6 }, outputTrimDb: 1.1,
    delayReturn: { highpass: 360, lowpass: 7_200, stereo: false }, reverbReturn: { highpass: 440, lowpass: 7_800 }, stereo: { base: 0.12, motion: 0.28 },
  },
  rave: {
    inputTrimDb: -0.9, highpass: 96,
    eq: { low: -1.2, mid: 0.7, high: 0.65, lowFrequency: 165, highFrequency: 5_900, tiltDb: 1.5 },
    filterCharacter: "clean", saturationCurve: "density", compressor: { attack: 0.009, release: 0.15, knee: 6 }, outputTrimDb: 0.9,
    delayReturn: { highpass: 310, lowpass: 7_800, stereo: true }, reverbReturn: { highpass: 390, lowpass: 8_400 }, stereo: { base: 0.1, motion: 0.32 },
  },
  texture: {
    inputTrimDb: 1.2, highpass: 138,
    eq: { low: -2.2, mid: -0.2, high: 1.1, lowFrequency: 210, highFrequency: 6_400, tiltDb: 1.7 },
    filterCharacter: "clean", saturationCurve: "density", compressor: { attack: 0.018, release: 0.24, knee: 7 }, outputTrimDb: 1.8,
    delayReturn: { highpass: 420, lowpass: 8_600, stereo: false }, reverbReturn: { highpass: 520, lowpass: 9_200 }, stereo: { base: 0.18, motion: 0.38 },
  },
};

function channel(track: TrackKind, overrides: Partial<PresetChannelRecipe> = {}): PresetChannelRecipe {
  const base = CHANNEL_DEFAULTS[track];
  return {
    ...base,
    ...overrides,
    eq: { ...base.eq, ...overrides.eq },
    compressor: { ...base.compressor, ...overrides.compressor },
    delayReturn: { ...base.delayReturn, ...overrides.delayReturn },
    reverbReturn: { ...base.reverbReturn, ...overrides.reverbReturn },
    stereo: { ...base.stereo, ...overrides.stereo },
  };
}

export const SOUND_PRESET_DEFINITIONS = {
  drums: [
    {
      id: "warehouse", kind: "drums", label: "Warehouse",
      hint: "909-Kick in der Tonart mit kurzem Click und Rumble, trockene Snare, Clap mit Raum, metallische Hats.",
      level: 0.56, envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.11 },
      channel: channel("drums", { inputTrimDb: -1.4, saturationCurve: "body", outputTrimDb: 0.7, eq: { low: 1.25, mid: -0.6, high: 0.35, lowFrequency: 105, highFrequency: 6_800, tiltDb: 1.1 } }),
      effects: effects({ filterBase: 12_500, filterMin: 0.62, filterMax: 1.28, resonancePressure: 1.5, delaySpace: 0.12, delayMotion: 0.035, reverbSpace: 0.16, saturationBase: 0.025, saturationPressure: 0.14 }),
      synthesis: {
        kick: { oscillator: "sine", note: "G1", pitchDecay: 0.048, octaves: 4.5, velocity: 0.88, transient: 0.32, rumble: { level: 0.29, decay: 1.1, cutoff: 150 } },
        snare: { noise: "pink", decay: 0.15, bodyNote: "D3", bodyDecay: 0.18, noiseLevel: 0.68, bodyLevel: 0.42, highpass: 125 },
        clap: { decay: 0.048, spacing: 0.012, level: 0.38, highpass: 520 },
        hats: { harmonicity: 5.1, modulationIndex: 25, resonance: 3_500, octaves: 1.35, frequency: 225, closedDecay: 0.065, openDecay: 0.2, level: 0.62, closedHighpass: 6_900, openHighpass: 5_600 },
        tom: { note: "G1", decay: 0.24, level: 0.62, lowpass: 1_900 },
        ride: { decay: 0.62, level: 0.4, highpass: 3_400, bell: 5_200 },
      },
    },
    {
      id: "steel", kind: "drums", label: "Stahl",
      hint: "Kurze höhere Kick mit wenig Rumble, harter Click und helle, breite Metall-Hats.",
      level: 0.6, envelope: { attack: 0.001, decay: 0.24, sustain: 0, release: 0.075 },
      channel: channel("drums", { inputTrimDb: -1, highpass: 29, saturationCurve: "bite", outputTrimDb: 0.5, compressor: { attack: 0.007, release: 0.08, knee: 4.5 }, eq: { low: -1.6, mid: 1.5, high: 1.7, lowFrequency: 125, highFrequency: 5_900, tiltDb: 1.1 } }),
      effects: effects({ filterBase: 13_000, filterMin: 0.7, filterMax: 1.25, resonanceBase: 1.05, resonancePressure: 2.15, delaySpace: 0.1, reverbSpace: 0.13, saturationBase: 0.09, saturationPressure: 0.21 }),
      synthesis: {
        kick: { oscillator: "sine", note: "A1", pitchDecay: 0.026, octaves: 6, velocity: 0.78, transient: 0.38, rumble: { level: 0.15, decay: 0.8, cutoff: 180 } },
        snare: { noise: "white", decay: 0.105, bodyNote: "E3", bodyDecay: 0.11, noiseLevel: 0.74, bodyLevel: 0.28, highpass: 210 },
        clap: { decay: 0.038, spacing: 0.009, level: 0.34, highpass: 760 },
        hats: { harmonicity: 6.4, modulationIndex: 38, resonance: 5_800, octaves: 1.9, frequency: 255, closedDecay: 0.045, openDecay: 0.135, level: 0.5, closedHighpass: 7_200, openHighpass: 6_000 },
        tom: { note: "A1", decay: 0.17, level: 0.54, lowpass: 2_500 },
        ride: { decay: 0.44, level: 0.38, highpass: 4_200, bell: 6_400 },
      },
    },
    {
      id: "rumble", kind: "drums", label: "Rumble",
      hint: "Trockener Kick-Transient, gesättigte Fahne auf dem Kick-Ton und ein tiefer, pumpender Rumble.",
      level: 0.43, envelope: { attack: 0.001, decay: 0.42, sustain: 0, release: 0.24 },
      channel: channel("drums", { inputTrimDb: -2.1, highpass: 22, saturationCurve: "density", outputTrimDb: 0.4, compressor: { attack: 0.016, release: 0.16, knee: 7 }, eq: { low: 3.1, mid: -1.4, high: -1.2, lowFrequency: 92, highFrequency: 5_200, tiltDb: 0.9 } }),
      effects: effects({ filterBase: 10_000, filterMin: 0.54, filterMax: 1.2, resonancePressure: 1.25, delaySpace: 0.08, delayMotion: 0.025, feedbackBase: 0.05, feedbackMotion: 0.14, reverbSpace: 0.12, saturationBase: 0.055, saturationPressure: 0.18 }),
      synthesis: {
        kick: { oscillator: "triangle", note: "F#1", pitchDecay: 0.06, octaves: 4.6, velocity: 0.82, transient: 0.3, subTail: { decay: 0.68, release: 0.32, cutoff: 110, level: 0.26 }, rumble: { level: 0.5, decay: 1.5, cutoff: 125 } },
        snare: { noise: "pink", decay: 0.17, bodyNote: "C3", bodyDecay: 0.24, noiseLevel: 0.58, bodyLevel: 0.46, highpass: 105 },
        clap: { decay: 0.055, spacing: 0.014, level: 0.31, highpass: 440 },
        hats: { harmonicity: 4.2, modulationIndex: 20, resonance: 2_800, octaves: 1.15, frequency: 205, closedDecay: 0.08, openDecay: 0.24, level: 0.5, closedHighpass: 5_600, openHighpass: 4_600 },
        tom: { note: "F1", decay: 0.3, level: 0.6, lowpass: 1_500 },
        ride: { decay: 0.78, level: 0.36, highpass: 2_900, bell: 4_600 },
      },
    },
  ],
  acid: [
    {
      id: "silverbox", kind: "acid", label: "Silverbox",
      hint: "Klassische Sägezahnlinie durch den Diode-Ladder, mit ausgewogener Filterhüllkurve.",
      level: 0.4, envelope: { attack: 0.003, decay: 0.32, sustain: 0.62, release: 0.085 },
      channel: channel("acid", { saturationCurve: "body", inputTrimDb: -1.8, outputTrimDb: 0.5, eq: { low: 0.4, mid: 0.9, high: -1.1, lowFrequency: 110, highFrequency: 4_500, tiltDb: 1.25 } }),
      effects: effects({ filterBase: 920, filterMin: 0.56, filterMax: 1.72, resonanceBase: 2.1, resonancePressure: 5.4, delaySpace: 0.08, delayMotion: 0.07, reverbSpace: 0.1, saturationBase: 0.07, saturationPressure: 0.17 }),
      synthesis: { oscillator: "sawtooth", filterBase: 92, cutoffOctaves: 3.9, filterOctaves: 4.8, filterQ: 5.6, filterDecay: 0.22, filterSustain: 0.2, portamento: 0.004, slidePortamento: 0.075, accent: { filterBoost: 1.22, saturationBoost: 0.045, velocityBoost: 1.08, decayMultiplier: 0.82 }, accentSweep: { base: 0.32, resonance: 0.5 }, drive: { base: 0.08, pressure: 0.38, tone: 4_800 } },
    },
    {
      id: "venom", kind: "acid", label: "Venom",
      hint: "Scharfer Saw, schnelle Hüllkurve, stärkster Biss und Ping-Pong-Echo.",
      level: 0.32, envelope: { attack: 0.002, decay: 0.16, sustain: 0.34, release: 0.055 },
      channel: channel("acid", { saturationCurve: "bite", inputTrimDb: -2.3, highpass: 36, outputTrimDb: 0.1, compressor: { attack: 0.005, release: 0.075, knee: 4.5 }, eq: { low: -2.1, mid: 1.8, high: 2.8, lowFrequency: 135, highFrequency: 3_900, tiltDb: 1.5 }, delayReturn: { highpass: 1_200, lowpass: 6_800, stereo: true }, reverbReturn: { highpass: 1_200, lowpass: 7_200 } }),
      effects: effects({ filterBase: 1_180, filterMin: 0.625, filterMax: 1.85, resonanceBase: 2.6, resonancePressure: 6.1, delaySpace: 0.28, delayMotion: 0.085, reverbSpace: 0.15, saturationBase: 0.12, saturationPressure: 0.2 }),
      synthesis: { oscillator: "sawtooth", filterBase: 118, cutoffOctaves: 4.8, filterOctaves: 6.5, filterQ: 7.8, filterDecay: 0.12, filterSustain: 0.12, portamento: 0.003, slidePortamento: 0.055, accent: { filterBoost: 1.34, saturationBoost: 0.06, velocityBoost: 1.1, decayMultiplier: 0.7 }, accentSweep: { base: 0.4, resonance: 0.6 }, drive: { base: 0.2, pressure: 0.55, tone: 6_200 } },
    },
    {
      id: "rubber", kind: "acid", label: "Rubber",
      hint: "Warmer Square-Puls mit tiefem Filter, elastischem Release und langem Slide.",
      level: 0.45, envelope: { attack: 0.004, decay: 0.36, sustain: 0.7, release: 0.15 },
      channel: channel("acid", { saturationCurve: "density", inputTrimDb: -1.5, highpass: 29, outputTrimDb: 0.8, compressor: { attack: 0.012, release: 0.14, knee: 7 }, eq: { low: 2.1, mid: 0.2, high: -2.1, lowFrequency: 98, highFrequency: 4_200, tiltDb: 1.1 } }),
      effects: effects({ filterBase: 720, filterMin: 0.5, filterMax: 1.58, resonanceBase: 1.7, resonancePressure: 4.7, delaySpace: 0.18, delayMotion: 0.055, reverbSpace: 0.2, saturationBase: 0.05, saturationPressure: 0.14 }),
      synthesis: { oscillator: "square", filterBase: 72, cutoffOctaves: 3.6, filterOctaves: 4.2, filterQ: 4.7, filterDecay: 0.26, filterSustain: 0.3, portamento: 0.008, slidePortamento: 0.13, accent: { filterBoost: 1.16, saturationBoost: 0.035, velocityBoost: 1.06, decayMultiplier: 0.9 }, accentSweep: { base: 0.24, resonance: 0.42 }, drive: { base: 0.04, pressure: 0.26, tone: 3_600 } },
    },
  ],
  stab: [
    {
      id: "concrete", kind: "stab", label: "Beton",
      hint: "Dunkler, kurzer Fat-Saw-Akkord mit kompakter Hüllkurve.",
      level: 0.2, envelope: { attack: 0.004, decay: 0.135, sustain: 0.055, release: 0.12 },
      channel: channel("stab", { saturationCurve: "bite", highpass: 132, outputTrimDb: 1.2, stereo: { base: 0.15, motion: 0.24 }, eq: { low: -2.2, mid: 1.7, high: -2, lowFrequency: 190, highFrequency: 2_500, tiltDb: 1.35 } }),
      effects: effects({ filterBase: 3_900, filterMin: 0.56, filterMax: 1.35, delaySpace: 0.16, reverbSpace: 0.22, saturationBase: 0.065, saturationPressure: 0.16 }),
      synthesis: { engine: "analog", oscillator: "fatsawtooth", unisonCount: 3, spread: 14, detune: 7 },
      voiceFilter: { base: 440, octaves: 2.15, attack: 0.002, decay: 0.09, sustain: 0.06, release: 0.1, q: 1.15 },
    },
    {
      id: "chord", kind: "stab", label: "Chord",
      hint: "Offener verstimmter Saw-Akkord mit sanfter Bewegung und längerem Release.",
      level: 0.24, envelope: { attack: 0.007, decay: 0.16, sustain: 0.13, release: 0.27 },
      channel: channel("stab", { saturationCurve: "body", highpass: 145, outputTrimDb: 1.4, stereo: { base: 0.2, motion: 0.32 }, eq: { low: 1.5, mid: -1, high: 4, lowFrequency: 210, highFrequency: 2_500, tiltDb: 1.6 } }),
      effects: effects({ filterBase: 5_600, filterMin: 0.62, filterMax: 1.5, delaySpace: 0.2, delayMotion: 0.09, reverbSpace: 0.32, saturationBase: 0.035, saturationPressure: 0.12 }),
      synthesis: { engine: "analog", oscillator: "fatsawtooth", unisonCount: 2, spread: 26, detune: 12 },
      voiceFilter: { base: 980, octaves: 4.2, attack: 0.005, decay: 0.19, sustain: 0.2, release: 0.24, q: 0.85 },
    },
    {
      id: "flash", kind: "stab", label: "Flash",
      hint: "Echter FM-Stab mit hellem Attack und kurzem metallischem Ausklang.",
      level: 0.205, envelope: { attack: 0.0015, decay: 0.17, sustain: 0.035, release: 0.18 },
      channel: channel("stab", { saturationCurve: "density", highpass: 164, outputTrimDb: 1.5, stereo: { base: 0.14, motion: 0.34 }, compressor: { attack: 0.011, release: 0.16, knee: 7 } }),
      effects: effects({ filterBase: 8_200, filterMin: 0.66, filterMax: 1.42, resonanceBase: 1.1, resonancePressure: 1.7, delaySpace: 0.17, reverbSpace: 0.26, saturationBase: 0.025, saturationPressure: 0.1 }),
      synthesis: { engine: "fm", carrier: "sine", modulator: "square", harmonicity: 2.7, modulationIndex: 8.2, modulationEnvelope: { attack: 0.001, decay: 0.11, sustain: 0.02, release: 0.12 } },
      voiceFilter: { base: 1_400, octaves: 3.1, attack: 0.001, decay: 0.075, sustain: 0.04, release: 0.13, q: 1.65 },
    },
  ],
  rave: [
    {
      id: "hoover", kind: "rave", label: "Hoover",
      hint: "Vierfach verstimmter Fat-Saw mit kontrolliertem Chorus und Vibrato.",
      level: 0.2, envelope: { attack: 0.014, decay: 0.21, sustain: 0.42, release: 0.3 },
      channel: channel("rave", { saturationCurve: "body", highpass: 112, outputTrimDb: 1, stereo: { base: 0.18, motion: 0.3 } }),
      effects: effects({ filterBase: 5_100, filterMin: 0.62, filterMax: 1.45, delaySpace: 0.19, delayMotion: 0.085, reverbSpace: 0.27, saturationBase: 0.055, saturationPressure: 0.16 }),
      synthesis: { engine: "analog", oscillator: "fatsawtooth", unisonCount: 4, spread: 34 },
      modulation: { frequency: 4.4, chorusWet: 0.16, chorusMotion: 0.12, vibratoDepth: 0.055, vibratoMotion: 0.08 },
    },
    {
      id: "pulse", kind: "rave", label: "Pulse",
      hint: "Enger Pulse-Lead mit präziser rhythmischer Hüllkurve.",
      level: 0.26, envelope: { attack: 0.003, decay: 0.095, sustain: 0.24, release: 0.105 },
      channel: channel("rave", { saturationCurve: "bite", highpass: 94, outputTrimDb: -0.4, stereo: { base: 0.34, motion: 0.48 }, compressor: { attack: 0.006, release: 0.1, knee: 5 }, eq: { low: -1.2, mid: 0.7, high: 3.2, lowFrequency: 165, highFrequency: 5_900, tiltDb: 1.5 } }),
      effects: effects({ filterBase: 6_700, filterMin: 0.64, filterMax: 1.48, delaySpace: 0.14, delayMotion: 0.06, reverbSpace: 0.2, saturationBase: 0.045, saturationPressure: 0.14 }),
      synthesis: { engine: "analog", oscillator: "pulse", unisonCount: 1, spread: 0, pulseWidth: 0.36 },
      modulation: { frequency: 5.2, chorusWet: 0.025, chorusMotion: 0.035, vibratoDepth: 0.012, vibratoMotion: 0.025 },
    },
    {
      id: "siren", kind: "rave", label: "Siren",
      hint: "Echte FM-Stimme mit begrenztem Vibrato und langer Alarmkontur.",
      level: 0.36, envelope: { attack: 0.035, decay: 0.34, sustain: 0.5, release: 0.48 },
      channel: channel("rave", { saturationCurve: "density", highpass: 128, outputTrimDb: 1.4, stereo: { base: 0.34, motion: 0.48 }, compressor: { attack: 0.016, release: 0.2, knee: 7 } }),
      effects: effects({ filterBase: 7_800, filterMin: 0.6, filterMax: 1.5, resonanceBase: 1.05, resonancePressure: 1.65, delaySpace: 0.2, delayMotion: 0.09, reverbSpace: 0.31, saturationBase: 0.025, saturationPressure: 0.1 }),
      synthesis: { engine: "fm", carrier: "sine", modulator: "sine", harmonicity: 1.5, modulationIndex: 5.4, modulationEnvelope: { attack: 0.06, decay: 0.3, sustain: 0.32, release: 0.42 } },
      modulation: { frequency: 5.8, chorusWet: 0.04, chorusMotion: 0.04, vibratoDepth: 0.07, vibratoMotion: 0.09 },
    },
  ],
  texture: [
    {
      id: "noise", kind: "texture", label: "Noise",
      hint: "Gefilterter Noise-Impuls mit kurzer spektraler Bewegung.",
      level: 0.42, envelope: { attack: 0.018, decay: 0.34, sustain: 0.055, release: 0.48 },
      channel: channel("texture", { saturationCurve: "density", inputTrimDb: 0.8, outputTrimDb: 1.4, stereo: { base: 0.32, motion: 0.36 } }),
      effects: effects({ filterBase: 4_600, filterMin: 0.55, filterMax: 1.58, resonanceBase: 0.7, resonancePressure: 1.25, delaySpace: 0.19, delayMotion: 0.09, reverbSpace: 0.42, saturationBase: 0.01, saturationPressure: 0.07 }),
      synthesis: { source: "noise", noise: "white", filterStart: 1_800, filterEnd: 6_200, sweepSeconds: 0.18 },
    },
    {
      id: "drone", kind: "texture", label: "Drone",
      hint: "Mono-Grundton unter breiten, langsam atmenden Saw-Obertönen.",
      level: 0.41, envelope: { attack: 0.48, decay: 0.82, sustain: 0.38, release: 1.7 },
      channel: channel("texture", { saturationCurve: "body", inputTrimDb: 1, highpass: 122, outputTrimDb: 1.8, stereo: { base: 0.22, motion: 0.18 } }),
      effects: effects({ filterBase: 2_200, filterMin: 0.48, filterMax: 1.38, resonanceBase: 0.65, resonancePressure: 1.1, delaySpace: 0.16, delayMotion: 0.065, reverbBase: 0.04, reverbSpace: 0.42, saturationBase: 0.02, saturationPressure: 0.075 }),
      synthesis: { source: "drone", unisonCount: 2, spread: 18, sawLevel: 0.58, sineLevel: 0.42, filterFrequency: 1_450 },
    },
    {
      id: "riser", kind: "texture", label: "Riser",
      hint: "Aufwärts gerichteter 1-/2-/4-Beat-Sweep mit kontrolliert wachsender Breite.",
      level: 0.38, envelope: { attack: 0.7, decay: 0.25, sustain: 0.28, release: 1.25 },
      channel: channel("texture", { saturationCurve: "density", inputTrimDb: 0.7, highpass: 156, outputTrimDb: 1.6, stereo: { base: 0.16, motion: 0.38 } }),
      effects: effects({ filterBase: 5_400, filterMin: 0.5, filterMax: 1.72, resonanceBase: 0.85, resonancePressure: 1.45, delaySpace: 0.2, delayMotion: 0.1, reverbBase: 0.03, reverbSpace: 0.43, saturationBase: 0.01, saturationPressure: 0.065 }),
      synthesis: { source: "riser", noise: "pink", filterStart: 420, filterEnd: 11_800, sweepSeconds: 1.35 },
    },
  ],
} satisfies SoundPresetCatalog;

export interface SafeEffectParameters {
  cutoff: number;
  eqTilt: number;
  q: number;
  threshold: number;
  ratio: number;
  delayWet: number;
  feedback: number;
  reverbWet: number;
  saturation: number;
}

export function presetDefinition<K extends TrackKind>(track: K, preset: SoundPresetId): PresetRecipeByTrack[K] {
  const definitions = SOUND_PRESET_DEFINITIONS[track] as unknown as readonly PresetRecipeByTrack[K][];
  return definitions.find((entry) => entry.id === preset) ?? definitions[0]!;
}

export function safeEffectParameters(track: TrackKind, preset: SoundPresetId, macros: TrackMacros, accent = false): SafeEffectParameters {
  const definition = presetDefinition(track, preset);
  const recipe = definition.effects;
  const color = normalized(macros.color);
  const pressure = normalized(macros.pressure);
  const space = normalized(macros.space);
  const motion = normalized(macros.motion);
  const accentRecipe = definition.kind === "acid" && accent ? definition.synthesis.accent : undefined;
  const cutoff = recipe.filterBase * interpolate(recipe.filterMin, recipe.filterMax, color) * (accentRecipe?.filterBoost ?? 1);

  return {
    cutoff: clamp(cutoff, SOUND_SAFETY_LIMITS.cutoff.min, SOUND_SAFETY_LIMITS.cutoff.max),
    eqTilt: (color - 0.5) * 2 * definition.channel.eq.tiltDb,
    q: clamp(recipe.resonanceBase + (track === "acid" ? pressure * recipe.resonancePressure : 0), 0.5, track === "acid" ? SOUND_SAFETY_LIMITS.resonance.acid : SOUND_SAFETY_LIMITS.resonance.other),
    threshold: clamp(recipe.thresholdBase - pressure * recipe.thresholdPressure, -24, -6),
    ratio: clamp(recipe.ratioBase + pressure * recipe.ratioPressure, 1, SOUND_SAFETY_LIMITS.compressionRatio),
    delayWet: clamp(recipe.delayBase + space * recipe.delaySpace, 0, SOUND_SAFETY_LIMITS.wet),
    feedback: clamp(recipe.feedbackBase + motion * recipe.feedbackMotion, 0, SOUND_SAFETY_LIMITS.feedback),
    reverbWet: clamp(recipe.reverbBase + space * recipe.reverbSpace, 0, SOUND_SAFETY_LIMITS.wet),
    saturation: clamp(recipe.saturationBase + pressure * recipe.saturationPressure + (accentRecipe?.saturationBoost ?? 0), 0, SOUND_SAFETY_LIMITS.saturation),
  };
}

export function acidStepParameters(preset: SoundPresetMap["acid"], accent: boolean, slide: boolean) {
  const recipe = presetDefinition("acid", preset).synthesis;
  return {
    filterBoost: accent ? recipe.accent.filterBoost : 1,
    saturationBoost: accent ? recipe.accent.saturationBoost : 0,
    velocityMultiplier: accent ? recipe.accent.velocityBoost : 1,
    decayMultiplier: accent ? recipe.accent.decayMultiplier : 1,
    portamento: slide ? recipe.slidePortamento : recipe.portamento,
  };
}

/** Where an envelope sweep of the 303 tops out at most. */
export const ACID_ENVELOPE_CEILING = 7_500;

/** The 303's cutoff knob: the color macro opens the filter exponentially from `filterBase`. */
export function acidCutoff(preset: SoundPresetMap["acid"], color: number): number {
  const recipe = presetDefinition("acid", preset).synthesis;
  return recipe.filterBase * 2 ** (recipe.cutoffOctaves * normalized(color));
}

/** How hard the pedal after the 303 is driven: pressure turns it up, an accent a little more. */
export function acidDrive(preset: SoundPresetMap["acid"], pressure: number, accent = false): number {
  const drive = presetDefinition("acid", preset).synthesis.drive;
  return clamp(drive.base + normalized(pressure) * drive.pressure + (accent ? 0.08 : 0), 0, SOUND_SAFETY_LIMITS.drive);
}

/** How much kick goes into the rumble hall: the preset's level at middle space, half of it with none, one and a half with full. */
export function kickRumbleSend(preset: SoundPresetMap["drums"], space: number): number {
  return presetDefinition("drums", preset).synthesis.kick.rumble.level * (0.5 + normalized(space));
}

/** Envelope depth in octaves above `cutoff`, never sweeping past the ceiling. */
export function acidEnvelopeOctaves(preset: SoundPresetMap["acid"], cutoff: number, boost = 1): number {
  const recipe = presetDefinition("acid", preset).synthesis;
  return Math.max(0.5, Math.min(recipe.filterOctaves * boost, Math.log2(ACID_ENVELOPE_CEILING / cutoff)));
}

export function soundSignature(recipe: SoundPresetRecipe): string {
  return JSON.stringify({ level: recipe.level, envelope: recipe.envelope, effects: recipe.effects, synthesis: recipe.synthesis, modulation: recipe.kind === "rave" ? recipe.modulation : undefined });
}

function interpolate(min: number, max: number, value: number): number {
  return min + (max - min) * value;
}

function normalized(value: number): number {
  return Number.isFinite(value) ? clamp(value, 0, 1) : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
