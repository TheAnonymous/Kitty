import { createFactoryProject } from "./defaults";
import { emptyStep, sanitizeDrumVoices } from "./patterns";
import type {
  BarPattern,
  GenreProfile,
  MixChannel,
  ProjectV1,
  Scene,
  Step,
  TrackKind,
  TrackMacros,
  TrackPattern,
} from "./types";
import {
  BARS_PER_SCENE,
  DYNAMICS,
  GENRE_PROFILES,
  MAX_SWING,
  MAX_TEMPO,
  MIN_TEMPO,
  ROOT_NOTES,
  SCALES,
  SCENE_COUNT,
  SCENE_ROLES,
  SCHEMA_VERSION,
  SOUND_PRESETS,
  STEP_LENGTHS,
  STEPS_PER_BAR,
  TRACK_KINDS,
} from "./types";

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function finite(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T) ? value as T : fallback;
}

function sanitizeStep(value: unknown, fallback: Step, track: TrackKind): Step {
  const source = record(value);
  const enabled = typeof source.enabled === "boolean" ? source.enabled : fallback.enabled;
  if (!enabled) return emptyStep();
  return {
    enabled: true,
    drumVoices: track === "drums" ? sanitizeDrumVoices(source.drumVoices, fallback.drumVoices) : [],
    degree: track === "drums" ? 0 : Math.round(finite(source.degree, fallback.degree, 0, 6)),
    octave: track === "drums" ? 2 : Math.round(finite(source.octave, fallback.octave, 1, 5)),
    dynamics: enumValue(source.dynamics, DYNAMICS, fallback.dynamics),
    length: enumValue(source.length, STEP_LENGTHS, fallback.length),
    slide: track === "acid" && (typeof source.slide === "boolean" ? source.slide : fallback.slide),
  };
}

function sanitizeBar(value: unknown, fallback: BarPattern, track: TrackKind): BarPattern {
  const source = record(value);
  const steps = Array.isArray(source.steps) ? source.steps : [];
  return {
    steps: Array.from({ length: STEPS_PER_BAR }, (_, index) => sanitizeStep(steps[index], fallback.steps[index]!, track)),
  };
}

function sanitizeMacros(value: unknown, fallback: TrackMacros): TrackMacros {
  const source = record(value);
  return {
    color: finite(source.color, fallback.color, 0, 1),
    pressure: finite(source.pressure, fallback.pressure, 0, 1),
    space: finite(source.space, fallback.space, 0, 1),
    motion: finite(source.motion, fallback.motion, 0, 1),
    density: finite(source.density, fallback.density, 0, 1),
  };
}

function sanitizeTrack(value: unknown, fallback: TrackPattern, track: TrackKind): TrackPattern {
  const source = record(value);
  const bars = Array.isArray(source.bars) ? source.bars : [];
  return {
    instrument: track,
    bars: Array.from({ length: BARS_PER_SCENE }, (_, index) => sanitizeBar(bars[index], fallback.bars[index]!, track)),
    macros: sanitizeMacros(source.macros, fallback.macros),
  };
}

function sanitizeScene(value: unknown, fallback: Scene): Scene {
  const source = record(value);
  const tracks = Array.isArray(source.tracks) ? source.tracks : [];
  return {
    role: fallback.role,
    name: typeof source.name === "string" && source.name.trim() ? source.name.trim().slice(0, 32) : fallback.name,
    tracks: TRACK_KINDS.map((track) => {
      const candidate = tracks.find((entry) => record(entry).instrument === track);
      return sanitizeTrack(candidate, fallback.tracks.find((entry) => entry.instrument === track)!, track);
    }),
  };
}

function sanitizeMix(value: unknown, fallback: MixChannel, track: TrackKind): MixChannel {
  const source = record(value);
  const muted = typeof source.muted === "boolean" ? source.muted : fallback.muted;
  return {
    instrument: track,
    muted,
    solo: muted ? false : typeof source.solo === "boolean" ? source.solo : fallback.solo,
    volume: finite(source.volume, fallback.volume, 0, 1),
  };
}

export function looksLikeProject(value: unknown): boolean {
  const source = record(value);
  return source.schemaVersion === SCHEMA_VERSION && Array.isArray(source.scenes) && Array.isArray(source.mix);
}

export function sanitizeProject(value: unknown): ProjectV1 {
  const source = record(value);
  const profile = enumValue(source.profile, GENRE_PROFILES, "hybrid") as GenreProfile;
  const fallback = createFactoryProject(profile);
  const scenes = Array.isArray(source.scenes) ? source.scenes : [];
  const mix = Array.isArray(source.mix) ? source.mix : [];
  const presets = record(source.soundPresets);
  return {
    schemaVersion: SCHEMA_VERSION,
    profile,
    tempo: finite(source.tempo, fallback.tempo, MIN_TEMPO, MAX_TEMPO),
    root: enumValue(source.root, ROOT_NOTES, fallback.root),
    scale: enumValue(source.scale, SCALES, fallback.scale),
    swing: finite(source.swing, fallback.swing, 0, MAX_SWING),
    masterVolume: finite(source.masterVolume, fallback.masterVolume, 0, 1),
    soundPresets: Object.fromEntries(TRACK_KINDS.map((track) => [
      track,
      enumValue(presets[track], SOUND_PRESETS[track], fallback.soundPresets[track]),
    ])) as ProjectV1["soundPresets"],
    mix: TRACK_KINDS.map((track) => sanitizeMix(
      mix.find((entry) => record(entry).instrument === track),
      fallback.mix.find((entry) => entry.instrument === track)!,
      track,
    )),
    scenes: Array.from({ length: SCENE_COUNT }, (_, index) => {
      const role = SCENE_ROLES[index]!;
      const candidate = scenes.find((entry) => record(entry).role === role) ?? scenes[index];
      return sanitizeScene(candidate, fallback.scenes[index]!);
    }),
  };
}

export function isValidProject(value: unknown): value is ProjectV1 {
  return looksLikeProject(value) && JSON.stringify(sanitizeProject(value)) === JSON.stringify(value);
}
