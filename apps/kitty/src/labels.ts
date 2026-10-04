import type { DrumVoice } from "./domain/types";

export const DRUM_LABELS: Record<DrumVoice, string> = { kick: "Kick", snare: "Snare", clap: "Clap", closedHat: "Closed Hat", openHat: "Open Hat", tom: "Tom", ride: "Ride" };

/** One letter per drum voice, as the step grid shows them. */
export const DRUM_SHORT: Record<DrumVoice, string> = { kick: "K", snare: "S", clap: "C", closedHat: "H", openHat: "O", tom: "T", ride: "R" };

export function percentLabel(value: number): string {
  return `${Math.round(value * 100)} %`;
}
