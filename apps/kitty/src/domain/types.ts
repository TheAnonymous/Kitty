export const SCHEMA_VERSION = 1 as const;
export const SCENE_COUNT = 4;
export const TRACK_COUNT = 5;
export const BARS_PER_SCENE = 4;
export const STEPS_PER_BAR = 16;
export const MIN_TEMPO = 120;
export const MAX_TEMPO = 180;
export const MAX_SWING = 0.35;
/** Passes of each scene in the scene chain and the arc export: 4, 8 or 16 bars. */
export const SCENE_REPEATS = [1, 2, 4] as const;
export const DEFAULT_SCENE_REPEATS = 2;
export const STEPS_PER_PASS = BARS_PER_SCENE * STEPS_PER_BAR;
/** How likely an enabled step plays on each pass. */
export const STEP_CHANCES = [1, 0.75, 0.5, 0.25] as const;
/** Hits a step splits into (a ratchet of 2–4 fast repeats). */
export const RATCHETS = [1, 2, 3, 4] as const;
/** Loop lengths a track can run at against the four-bar scene (polymeter). */
export const LOOP_LENGTHS = [64, 60, 56, 48, 32, 30, 28, 16, 15, 14, 12] as const;
export const RATCHET_TRACKS = ["drums", "acid", "stab", "rave"] as const;

export const GENRE_PROFILES = ["hard", "acid", "hybrid"] as const;
export const TRACK_KINDS = ["drums", "acid", "stab", "rave", "texture"] as const;
export const SCENE_ROLES = ["warmup", "drive", "break", "peak"] as const;
export const ROOT_NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
export const SCALES = ["minor", "phrygian", "harmonicMinor"] as const;
export const DYNAMICS = ["ghost", "normal", "accent"] as const;
export const STEP_LENGTHS = ["short", "normal", "long"] as const;
export const VARIATION_AMOUNTS = ["subtle", "lively", "bold"] as const;
export const DRUM_VOICES = ["kick", "snare", "clap", "closedHat", "openHat", "tom"] as const;
export const MACRO_KINDS = ["color", "pressure", "space", "motion", "density"] as const;

export const SOUND_PRESETS = {
  drums: ["warehouse", "steel", "rumble"],
  acid: ["silverbox", "venom", "rubber"],
  stab: ["concrete", "chord", "flash"],
  rave: ["hoover", "pulse", "siren"],
  texture: ["noise", "drone", "riser"],
} as const;

export type GenreProfile = (typeof GENRE_PROFILES)[number];
export type TrackKind = (typeof TRACK_KINDS)[number];
export type SceneRole = (typeof SCENE_ROLES)[number];
export type RootNote = (typeof ROOT_NOTES)[number];
export type Scale = (typeof SCALES)[number];
export type StepDynamics = (typeof DYNAMICS)[number];
export type StepLength = (typeof STEP_LENGTHS)[number];
export type VariationAmount = (typeof VARIATION_AMOUNTS)[number];
export type DrumVoice = (typeof DRUM_VOICES)[number];
export type MacroKind = (typeof MACRO_KINDS)[number];
export type SceneRepeats = (typeof SCENE_REPEATS)[number];
export type SoundPresetId = (typeof SOUND_PRESETS)[TrackKind][number];
export type SoundPresetMap = { [K in TrackKind]: (typeof SOUND_PRESETS)[K][number] };

export interface Step {
  enabled: boolean;
  drumVoices: DrumVoice[];
  degree: number;
  octave: number;
  dynamics: StepDynamics;
  length: StepLength;
  slide: boolean;
  /** Chance to play (0.25–0.75); absent means always. */
  probability?: number;
  /** Fast repeats within the step (2–4); absent means one hit. */
  ratchet?: number;
}

export interface BarPattern { steps: Step[]; }

export interface TrackMacros {
  color: number;
  pressure: number;
  space: number;
  motion: number;
  density: number;
}

export interface TrackPattern {
  instrument: TrackKind;
  bars: BarPattern[];
  macros: TrackMacros;
  /** Steps before the track loops (12–60); absent means all 64. */
  loopSteps?: number;
}

export interface Scene {
  role: SceneRole;
  name: string;
  tracks: TrackPattern[];
}

export interface MixChannel {
  instrument: TrackKind;
  muted: boolean;
  solo: boolean;
  volume: number;
}

export interface ProjectV1 {
  schemaVersion: typeof SCHEMA_VERSION;
  profile: GenreProfile;
  tempo: number;
  root: RootNote;
  scale: Scale;
  swing: number;
  masterVolume: number;
  mix: MixChannel[];
  soundPresets: SoundPresetMap;
  scenes: Scene[];
  sceneRepeats: SceneRepeats;
}

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: string;
}

export interface AppUiState {
  selectedScene: number;
  selectedTrack: TrackKind;
  selectedBar: number;
  selectedStep: number | null;
  variationAmount: VariationAmount;
  locks: Record<TrackKind, [boolean, boolean, boolean, boolean]>;
  /** Plays warmup → drive → break → peak in a loop, each scene `sceneRepeats` times. */
  sceneChain: boolean;
}

export interface TransportState {
  status: "idle" | "starting" | "playing" | "suspended" | "error";
  runningScene: number;
  queuedScene: number | null;
  bar: number;
  step: number;
  /** Completed passes through the running scene, for tracks with their own loop length. */
  pass: number;
  peak: number;
  trackPeaks: Record<TrackKind, number>;
  message: string;
}

export interface AppState {
  project: ProjectV1;
  ui: AppUiState;
  transport: TransportState;
  canUndo: boolean;
  canRedo: boolean;
  autosave: "ready" | "saving" | "saved" | "error";
}
