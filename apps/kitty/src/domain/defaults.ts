import { generateTypicalPattern } from "./patterns";
import type {
  AppUiState,
  GenreProfile,
  ProjectV1,
  Scene,
  SceneRole,
  SoundPresetMap,
  TrackKind,
  TrackMacros,
  TransportState,
} from "./types";
import { SCHEMA_VERSION, TRACK_KINDS } from "./types";

export const PROFILE_DEFINITIONS: Record<GenreProfile, { label: string; description: string; tempo: number; root: ProjectV1["root"]; scale: ProjectV1["scale"] }> = {
  hard: { label: "Hard", description: "155 BPM · F-Phrygisch · druckvolle Warehouse-Patterns", tempo: 155, root: "F", scale: "phrygian" },
  acid: { label: "Acid", description: "145 BPM · A-Moll · dominante 303-Linien", tempo: 145, root: "A", scale: "minor" },
  hybrid: { label: "Hybrid", description: "150 BPM · Fis-Moll · Hard und Acid im Gleichgewicht", tempo: 150, root: "F#", scale: "minor" },
};

export const PROFILE_SOUND_PRESETS: Record<GenreProfile, SoundPresetMap> = {
  hard: { drums: "rumble", acid: "venom", stab: "concrete", rave: "hoover", texture: "noise" },
  acid: { drums: "steel", acid: "silverbox", stab: "chord", rave: "pulse", texture: "noise" },
  hybrid: { drums: "warehouse", acid: "silverbox", stab: "concrete", rave: "hoover", texture: "noise" },
};

const SCENES: readonly { role: SceneRole; name: string; seed: number }[] = [
  { role: "warmup", name: "Aufwärmen", seed: 0x4b495454 },
  { role: "drive", name: "Druck", seed: 0x44524956 },
  { role: "break", name: "Break", seed: 0x42524541 },
  { role: "peak", name: "Peak", seed: 0x5045414b },
];

function macrosFor(track: TrackKind, role: SceneRole, profile: GenreProfile): TrackMacros {
  const density = { warmup: 0.38, drive: 0.68, break: 0.32, peak: 0.86 }[role];
  const values: Record<TrackKind, TrackMacros> = {
    drums: { color: 0.54, pressure: 0.76, space: 0.12, motion: 0.22, density },
    acid: { color: 0.64, pressure: profile === "acid" ? 0.78 : 0.62, space: 0.18, motion: 0.7, density },
    stab: { color: 0.58, pressure: 0.58, space: 0.34, motion: 0.28, density },
    rave: { color: 0.7, pressure: 0.48, space: 0.42, motion: 0.62, density },
    texture: { color: 0.46, pressure: 0.24, space: 0.72, motion: 0.66, density },
  };
  return values[track];
}

export function createFactoryProject(profile: GenreProfile = "hybrid"): ProjectV1 {
  const definition = PROFILE_DEFINITIONS[profile];
  const scenes: Scene[] = SCENES.map((scene, sceneIndex) => ({
    role: scene.role,
    name: scene.name,
    tracks: TRACK_KINDS.map((track, trackIndex) => ({
      instrument: track,
      bars: generateTypicalPattern(track, profile, scene.role, scene.seed + sceneIndex * 97 + trackIndex * 31),
      macros: macrosFor(track, scene.role, profile),
    })),
  }));

  return {
    schemaVersion: SCHEMA_VERSION,
    profile,
    tempo: definition.tempo,
    root: definition.root,
    scale: definition.scale,
    swing: profile === "hard" ? 0.04 : 0.08,
    masterVolume: 0.76,
    soundPresets: { ...PROFILE_SOUND_PRESETS[profile] },
    mix: TRACK_KINDS.map((instrument) => ({
      instrument,
      muted: false,
      solo: false,
      volume: instrument === "texture" ? 0.55 : instrument === "rave" ? 0.64 : 0.78,
    })),
    scenes,
  };
}

export function createUiState(): AppUiState {
  return {
    selectedScene: 0,
    selectedTrack: "drums",
    selectedBar: 0,
    selectedStep: null,
    variationAmount: "lively",
    locks: Object.fromEntries(TRACK_KINDS.map((track) => [track, [false, false, false, false]])) as AppUiState["locks"],
  };
}

export function createTransportState(): TransportState {
  return {
    status: "idle",
    runningScene: 0,
    queuedScene: null,
    bar: 0,
    step: 0,
    peak: 0,
    trackPeaks: Object.fromEntries(TRACK_KINDS.map((track) => [track, 0])) as TransportState["trackPeaks"],
    message: "Bereit – Start aktiviert den Klang",
  };
}
