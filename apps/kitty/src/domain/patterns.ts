import type {
  BarPattern,
  DrumVoice,
  GenreProfile,
  SceneRole,
  Step,
  TrackKind,
  TrackPattern,
  VariationAmount,
} from "./types";
import { BARS_PER_SCENE, STEPS_PER_BAR } from "./types";

type Random = () => number;

const TEMPLATES: Record<TrackKind, readonly (readonly number[])[]> = {
  drums: [[0, 2, 4, 6, 8, 10, 12, 14], [0, 3, 4, 6, 8, 11, 12, 14, 15]],
  acid: [[0, 3, 6, 8, 11, 14], [0, 2, 5, 8, 10, 13, 15], [0, 3, 7, 8, 11, 12, 15]],
  stab: [[0, 8], [0, 6, 12], [2, 8, 14]],
  rave: [[0, 4, 8, 12], [2, 5, 10, 13], [0, 3, 6, 9, 12, 15]],
  texture: [[0], [0, 8], [4, 12]],
};

function xorshift(seed: number): Random {
  let state = seed >>> 0 || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

function hash(value: string): number {
  let result = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 0x01000193);
  }
  return result >>> 0;
}

function choose<T>(values: readonly T[], random: Random): T {
  return values[Math.min(values.length - 1, Math.floor(random() * values.length))]!;
}

export function emptyStep(): Step {
  return { enabled: false, drumVoices: [], degree: 0, octave: 2, dynamics: "normal", length: "normal", slide: false };
}

export function emptyBar(): BarPattern {
  return { steps: Array.from({ length: STEPS_PER_BAR }, emptyStep) };
}

export function sanitizeDrumVoices(value: unknown, fallback: readonly DrumVoice[] = ["kick"]): DrumVoice[] {
  const allowed: DrumVoice[] = ["kick", "snare", "clap", "closedHat", "openHat", "tom"];
  const values = Array.isArray(value) ? value.filter((entry): entry is DrumVoice => allowed.includes(entry as DrumVoice)) : [...fallback];
  const result: DrumVoice[] = [];
  for (const voice of values) {
    if (result.includes(voice)) continue;
    if ((voice === "kick" && result.includes("tom")) || (voice === "tom" && result.includes("kick"))) continue;
    if ((voice === "closedHat" && result.includes("openHat")) || (voice === "openHat" && result.includes("closedHat"))) continue;
    result.push(voice);
    if (result.length === 2) break;
  }
  if (result.length) return result;
  return fallback.length ? sanitizeDrumVoices([...fallback], ["kick"]) : ["kick"];
}

function defaultDrums(step: number): DrumVoice[] {
  if (step % 4 === 0) return step % 8 === 0 ? ["kick", "closedHat"] : ["kick", "clap"];
  if (step % 4 === 2) return ["closedHat"];
  return ["openHat"];
}

export function isAnchor(track: TrackKind, stepIndex: number, step: Step): boolean {
  if (!step.enabled) return false;
  if (track === "drums") return stepIndex % 4 === 0 && step.drumVoices.includes("kick");
  if (track === "acid") return (stepIndex === 0 || stepIndex === 8) && step.degree === 0;
  return stepIndex === 0 && step.degree === 0;
}

function enable(bar: BarPattern, stepIndex: number, track: TrackKind, random: Random): void {
  const step = bar.steps[stepIndex];
  if (!step) return;
  step.enabled = true;
  step.dynamics = stepIndex === 0 ? "accent" : random() > 0.82 ? "ghost" : "normal";
  step.length = track === "stab" || track === "rave" ? "short" : "normal";
  if (track === "drums") step.drumVoices = defaultDrums(stepIndex);
  else {
    step.degree = stepIndex === 0 || stepIndex === 8 ? 0 : Math.floor(random() * 7);
    step.octave = track === "acid" ? 2 : track === "stab" ? 3 : 4;
    step.slide = track === "acid" && stepIndex > 0 && random() > 0.72;
  }
}

function densityFor(profile: GenreProfile, role: SceneRole, track: TrackKind): number {
  const scene = { warmup: 0.55, drive: 0.82, break: 0.42, peak: 1 }[role];
  const profileBias = profile === "hard"
    ? (track === "drums" || track === "stab" ? 1.12 : 0.82)
    : profile === "acid"
      ? (track === "acid" ? 1.18 : track === "rave" ? 0.72 : 0.94)
      : 1;
  return Math.min(1, scene * profileBias);
}

export function generateTypicalPattern(
  track: TrackKind,
  profile: GenreProfile,
  role: SceneRole,
  seed: number,
): BarPattern[] {
  const random = xorshift(seed ^ hash(`${track}:${profile}:${role}`));
  const density = densityFor(profile, role, track);
  return Array.from({ length: BARS_PER_SCENE }, (_, barIndex) => {
    const bar = emptyBar();
    const template = choose(TEMPLATES[track], random);
    for (const stepIndex of template) {
      if (stepIndex === 0 || random() <= density) enable(bar, stepIndex, track, random);
    }
    if (track === "drums") {
      for (const anchor of [0, 4, 8, 12]) enable(bar, anchor, track, random);
      if (barIndex === 3 && role !== "break") {
        enable(bar, 15, track, random);
        bar.steps[15]!.drumVoices = random() > 0.5 ? ["tom"] : ["openHat"];
      }
    } else {
      enable(bar, 0, track, random);
      if (track === "acid") enable(bar, 8, track, random);
    }
    return bar;
  });
}

export function cycleStep(step: Step, track: TrackKind, stepIndex: number): Step {
  if (!step.enabled) {
    const next = emptyStep();
    next.enabled = true;
    next.drumVoices = track === "drums" ? defaultDrums(stepIndex) : [];
    next.octave = track === "acid" ? 2 : track === "stab" ? 3 : 4;
    return next;
  }
  if (step.dynamics === "normal") return { ...step, drumVoices: [...step.drumVoices], dynamics: "accent" };
  return emptyStep();
}

export function varyPattern(pattern: TrackPattern, amount: VariationAmount, locks: readonly boolean[]): boolean {
  const before = JSON.stringify(pattern.bars);
  const random = xorshift(hash(`${before}:${amount}`));
  const attempts = amount === "subtle" ? 1 : amount === "lively" ? 3 : 6;
  const candidates = pattern.bars.flatMap((bar, barIndex) => locks[barIndex]
    ? []
    : bar.steps.flatMap((step, stepIndex) => isAnchor(pattern.instrument, stepIndex, step) ? [] : [{ step, stepIndex }]));
  for (let index = 0; index < attempts && candidates.length; index += 1) {
    const candidateIndex = Math.floor(random() * candidates.length);
    const candidate = candidates.splice(candidateIndex, 1)[0];
    if (!candidate) break;
    if (candidate.step.enabled && random() > 0.45) {
      candidate.step.dynamics = candidate.step.dynamics === "ghost" ? "accent" : "ghost";
      if (pattern.instrument === "acid") candidate.step.slide = !candidate.step.slide;
    } else if (candidate.step.enabled) {
      Object.assign(candidate.step, emptyStep());
    } else {
      candidate.step.enabled = true;
      candidate.step.octave = pattern.instrument === "acid" ? 2 : pattern.instrument === "stab" ? 3 : 4;
      candidate.step.degree = Math.floor(random() * 7);
      candidate.step.drumVoices = pattern.instrument === "drums" ? defaultDrums(candidate.stepIndex) : [];
    }
  }
  return JSON.stringify(pattern.bars) !== before;
}

export function replaceWithTypical(
  pattern: TrackPattern,
  profile: GenreProfile,
  role: SceneRole,
  locks: readonly boolean[],
): boolean {
  const before = JSON.stringify(pattern.bars);
  const generated = generateTypicalPattern(pattern.instrument, profile, role, hash(before));
  generated.forEach((bar, index) => { if (!locks[index]) pattern.bars[index] = bar; });
  return JSON.stringify(pattern.bars) !== before;
}
