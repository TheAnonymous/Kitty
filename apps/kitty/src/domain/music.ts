import type { RootNote, Scale } from "./types";
import { ROOT_NOTES } from "./types";

const SCALE_OFFSETS: Record<Scale, readonly number[]> = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
};

export const ROOT_LABELS: Record<RootNote, string> = Object.fromEntries(
  ROOT_NOTES.map((note) => [note, note.replace("#", "♯")]),
) as Record<RootNote, string>;

export const SCALE_LABELS: Record<Scale, string> = {
  minor: "Moll",
  phrygian: "Phrygisch",
  harmonicMinor: "Harmonisch Moll",
};

export const DEGREE_LABELS = ["Grundton", "Sekunde", "Terz", "Quarte", "Quinte", "Sexte", "Septime"] as const;

export function scaleOffsets(scale: Scale): readonly number[] {
  return SCALE_OFFSETS[scale];
}

export function rootSemitone(root: RootNote): number {
  return ROOT_NOTES.indexOf(root);
}

export function scaleDegreeMidi(root: RootNote, scale: Scale, degree: number, octave = 2): number {
  const offsets = scaleOffsets(scale);
  const position = Math.max(0, Math.min(6, Math.round(degree)));
  return 12 + Math.max(1, Math.min(5, Math.round(octave))) * 12 + rootSemitone(root) + (offsets[position] ?? 0);
}

export function isScaleTone(root: RootNote, scale: Scale, midi: number): boolean {
  const pitchClass = ((Math.round(midi) - rootSemitone(root)) % 12 + 12) % 12;
  return scaleOffsets(scale).includes(pitchClass);
}

export function noteName(midi: number): string {
  const note = ROOT_NOTES[((Math.round(midi) % 12) + 12) % 12] ?? "C";
  return `${ROOT_LABELS[note]}${Math.floor(Math.round(midi) / 12) - 1}`;
}

export function scaleChord(root: RootNote, scale: Scale, degree: number, octave = 3): number[] {
  return [degree, degree + 2, degree + 4].map((position) => {
    const wrapped = ((position % 7) + 7) % 7;
    const octaveShift = Math.floor(position / 7);
    return scaleDegreeMidi(root, scale, wrapped, octave + octaveShift);
  });
}
