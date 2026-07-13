import type { SoundPresetId, TrackKind, TrackMacros } from "./types";

export interface SoundPresetDefinition {
  id: SoundPresetId;
  label: string;
  hint: string;
  level: number;
  brightness: number;
  oscillator: "sine" | "triangle" | "sawtooth" | "square" | "fatsawtooth" | "fmsine";
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

export const SOUND_PRESET_DEFINITIONS: { [K in TrackKind]: readonly SoundPresetDefinition[] } = {
  drums: [
    { id: "warehouse", label: "Warehouse", hint: "Trockene Kick, stählerne Hats und kurzer Raum.", level: 0.54, brightness: 0.56, oscillator: "sine", attack: 0.001, decay: 0.28, sustain: 0, release: 0.12 },
    { id: "steel", label: "Stahl", hint: "Hellere Transienten und aggressive Metall-Hats.", level: 0.48, brightness: 0.84, oscillator: "sine", attack: 0.001, decay: 0.2, sustain: 0, release: 0.09 },
    { id: "rumble", label: "Rumble", hint: "Dunkler, längerer Kickkörper für große Räume.", level: 0.5, brightness: 0.34, oscillator: "triangle", attack: 0.001, decay: 0.42, sustain: 0, release: 0.22 },
  ],
  acid: [
    { id: "silverbox", label: "Silverbox", hint: "Klassische Sägezahnlinie mit kontrollierter Resonanz.", level: 0.34, brightness: 0.58, oscillator: "sawtooth", attack: 0.003, decay: 0.16, sustain: 0.28, release: 0.08 },
    { id: "venom", label: "Venom", hint: "Scharfer Sägezahn und bissige Filterbewegung.", level: 0.3, brightness: 0.82, oscillator: "sawtooth", attack: 0.002, decay: 0.12, sustain: 0.2, release: 0.06 },
    { id: "rubber", label: "Rubber", hint: "Runder Rechteckpuls mit elastischem Nachklang.", level: 0.35, brightness: 0.44, oscillator: "square", attack: 0.004, decay: 0.2, sustain: 0.34, release: 0.12 },
  ],
  stab: [
    { id: "concrete", label: "Beton", hint: "Kurzer, dunkler Moll-Akkord mit viel Körper.", level: 0.22, brightness: 0.42, oscillator: "fatsawtooth", attack: 0.004, decay: 0.16, sustain: 0.08, release: 0.14 },
    { id: "chord", label: "Chord", hint: "Offener analoger Akkordschlag für den Offbeat.", level: 0.2, brightness: 0.62, oscillator: "sawtooth", attack: 0.003, decay: 0.13, sustain: 0.1, release: 0.18 },
    { id: "flash", label: "Flash", hint: "Heller FM-Stab für klare Break-Akzente.", level: 0.18, brightness: 0.86, oscillator: "fmsine", attack: 0.002, decay: 0.2, sustain: 0.06, release: 0.22 },
  ],
  rave: [
    { id: "hoover", label: "Hoover", hint: "Breiter, verstimmter Rave-Ton mit rauer Kontur.", level: 0.22, brightness: 0.58, oscillator: "fatsawtooth", attack: 0.012, decay: 0.2, sustain: 0.4, release: 0.25 },
    { id: "pulse", label: "Pulse", hint: "Straffer Rechteck-Lead für rhythmische Signale.", level: 0.24, brightness: 0.7, oscillator: "square", attack: 0.004, decay: 0.12, sustain: 0.28, release: 0.12 },
    { id: "siren", label: "Siren", hint: "Schneidende FM-Farbe für Alarm- und Übergangsfiguren.", level: 0.2, brightness: 0.9, oscillator: "fmsine", attack: 0.02, decay: 0.3, sustain: 0.46, release: 0.4 },
  ],
  texture: [
    { id: "noise", label: "Noise", hint: "Kurze Rauschimpulse für Bewegung und Übergänge.", level: 0.15, brightness: 0.68, oscillator: "sine", attack: 0.04, decay: 0.45, sustain: 0.08, release: 0.7 },
    { id: "drone", label: "Drone", hint: "Dunkler, gehaltener Grundton unter dem Groove.", level: 0.14, brightness: 0.3, oscillator: "fatsawtooth", attack: 0.4, decay: 0.8, sustain: 0.36, release: 1.6 },
    { id: "riser", label: "Riser", hint: "Heller, anschwellender Übergangsklang.", level: 0.12, brightness: 0.86, oscillator: "fmsine", attack: 0.65, decay: 0.3, sustain: 0.24, release: 1.2 },
  ],
};

export function presetDefinition(track: TrackKind, preset: SoundPresetId): SoundPresetDefinition {
  return SOUND_PRESET_DEFINITIONS[track].find((entry) => entry.id === preset) ?? SOUND_PRESET_DEFINITIONS[track][0]!;
}

export function safeEffectParameters(track: TrackKind, preset: SoundPresetId, macros: TrackMacros) {
  const definition = presetDefinition(track, preset);
  const base = track === "acid" ? 1_100 : track === "texture" ? 4_200 : track === "drums" ? 9_000 : 5_800;
  return {
    cutoff: clamp(base * (0.55 + definition.brightness) * (0.65 + macros.color * 0.7), 180, 13_000),
    q: clamp(0.8 + macros.pressure * (track === "acid" ? 7 : 2.4), 0.8, track === "acid" ? 8 : 3.2),
    threshold: clamp(-8 - macros.pressure * 12, -20, -8),
    ratio: clamp(1.3 + macros.pressure * 3.2, 1.3, 4.5),
    delayWet: clamp(macros.space * 0.2 + macros.motion * 0.08, 0, 0.28),
    feedback: clamp(0.08 + macros.motion * 0.24, 0.08, 0.32),
    reverbWet: clamp(macros.space * (track === "texture" ? 0.46 : 0.28), 0, track === "texture" ? 0.46 : 0.28),
  };
}

function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }
