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
import { BARS_PER_SCENE, RATCHET_TRACKS, STEPS_PER_BAR, STEPS_PER_PASS } from "./types";

type Random = () => number;

/** Step templates of the tracks without a generator of their own (drums and acid have one below). */
const TEMPLATES: Record<Exclude<TrackKind, "drums" | "acid">, readonly (readonly number[])[]> = {
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

/** Where a track with its own loop length stands after `total` sixteenths of the running scene. */
export function loopPosition(loopSteps: number | undefined, total: number): { bar: number; step: number } {
  const length = Math.max(1, Math.min(STEPS_PER_PASS, Math.round(loopSteps ?? STEPS_PER_PASS)));
  const index = ((Math.round(total) % length) + length) % length;
  return { bar: Math.floor(index / STEPS_PER_BAR), step: index % STEPS_PER_BAR };
}

/** Sixteenths since the running scene started. */
export function sceneSteps(position: { pass: number; bar: number; step: number }): number {
  return position.pass * STEPS_PER_PASS + position.bar * STEPS_PER_BAR + position.step;
}

export function stepChance(step: Step): number {
  return step.probability ?? 1;
}

export function stepRatchet(step: Step): number {
  return step.ratchet ?? 1;
}

export function allowsRatchet(track: TrackKind): boolean {
  return (RATCHET_TRACKS as readonly TrackKind[]).includes(track);
}

export function emptyBar(): BarPattern {
  return { steps: Array.from({ length: STEPS_PER_BAR }, emptyStep) };
}

export function sanitizeDrumVoices(value: unknown, fallback: readonly DrumVoice[] = ["kick"]): DrumVoice[] {
  const allowed: DrumVoice[] = ["kick", "snare", "clap", "closedHat", "openHat", "tom", "ride"];
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

/** A techno grid: kick on the quarters with the clap on two and four, open hat on the offbeat, closed hats between. */
function defaultDrums(step: number): DrumVoice[] {
  if (step % 4 === 0) return step === 4 || step === 12 ? ["kick", "clap"] : ["kick"];
  if (step % 4 === 2) return ["openHat"];
  return ["closedHat"];
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
  if (track === "acid") return acidPattern(random, profile, role);
  if (track === "drums") return drumPattern(random, profile, role);
  const density = densityFor(profile, role, track);
  return Array.from({ length: BARS_PER_SCENE }, () => {
    const bar = emptyBar();
    const template = choose(TEMPLATES[track], random);
    for (const stepIndex of template) {
      if (stepIndex === 0 || random() <= density) enable(bar, stepIndex, track, random);
    }
    enable(bar, 0, track, random);
    return bar;
  });
}

// ---- the 303 -------------------------------------------------------------------------

/** How often a 303 line reaches for each scale degree: mostly the root, then fifth, seventh and third. */
const ACID_DEGREE_WEIGHTS: readonly number[] = [0.5, 0.04, 0.12, 0.05, 0.14, 0.03, 0.12];
/** Notes per bar: a 303 line runs on sixteenths with a few rests. */
const ACID_NOTES_PER_BAR: Record<SceneRole, number> = { warmup: 9, drive: 12, break: 7, peak: 13 };
/** Where a line sits besides its anchors on one and three; the offbeats draw a little more. */
const ACID_POSITION_WEIGHTS: readonly number[] = [0, 1, 1.3, 1.1, 1, 1, 1.3, 1.1, 0, 1, 1.3, 1.1, 1, 1, 1.3, 1.2];

function weighted(weights: readonly number[], random: Random): number {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = random() * total;
  for (let index = 0; index < weights.length; index += 1) {
    roll -= weights[index]!;
    if (roll < 0) return index;
  }
  return weights.length - 1;
}

/** One note in the acid idiom: mostly the root, often an octave up; `lift` makes jumps likelier. */
function acidNote(random: Random, profile: GenreProfile, lift = 0): { degree: number; octave: number } {
  // Hard tracks lean on the root and the phrygian flat second.
  const weights = profile === "hard" ? ACID_DEGREE_WEIGHTS.map((weight, degree) => (degree === 0 ? 0.56 : degree === 1 ? 0.1 : weight)) : ACID_DEGREE_WEIGHTS;
  const degree = weighted(weights, random);
  return { degree, octave: random() < (degree === 0 ? 0.32 : 0.16) + lift ? 3 : 2 };
}

function acidBar(random: Random, profile: GenreProfile, role: SceneRole): BarPattern {
  const bar = emptyBar();
  const target = Math.max(6, Math.min(15, ACID_NOTES_PER_BAR[role] + (profile === "acid" ? 1 : profile === "hard" ? -1 : 0)));
  const positions = new Set([0, 8]);
  const weights = [...ACID_POSITION_WEIGHTS];
  while (positions.size < target) {
    const index = weighted(weights, random);
    positions.add(index);
    weights[index] = 0;
  }
  const lift = role === "peak" ? 0.1 : role === "break" ? -0.06 : 0;
  const accentChance = role === "peak" ? 0.34 : role === "break" ? 0.18 : 0.27;
  for (const index of [...positions].sort((left, right) => left - right)) {
    // One and three stay on the root, three now and then an octave up.
    const note = index === 0 || index === 8 ? { degree: 0, octave: index === 8 && random() < 0.35 ? 3 : 2 } : acidNote(random, profile, lift);
    Object.assign(bar.steps[index]!, {
      enabled: true,
      degree: note.degree,
      octave: note.octave,
      dynamics: index === 0 || random() < accentChance ? "accent" : random() < 0.06 ? "ghost" : "normal",
      length: role === "break" && random() < 0.3 ? "long" : random() < 0.12 ? "short" : "normal",
      // A slide glides in from the note before, so it needs one.
      slide: index > 0 && bar.steps[index - 1]!.enabled && random() < 0.2,
    });
  }
  // The squelch lives in the accents: at least one besides the downbeat.
  const plain = bar.steps.flatMap((step, index) => step.enabled && index > 0 && step.dynamics !== "accent" ? [index] : []);
  if (bar.steps.filter((step) => step.dynamics === "accent" && step.enabled).length < 2 && plain.length > 0) {
    bar.steps[choose(plain, random)]!.dynamics = "accent";
  }
  return bar;
}

/** The answer of a phrase: a few notes in the second half change, reaching up towards the next downbeat. */
function answerBar(source: BarPattern, random: Random, profile: GenreProfile, changes: number): BarPattern {
  const bar = structuredClone(source);
  for (let count = 0; count < changes; count += 1) {
    const index = 9 + Math.floor(random() * 7);
    const note = acidNote(random, profile, 0.25);
    Object.assign(bar.steps[index]!, {
      enabled: true,
      degree: note.degree,
      octave: note.octave,
      dynamics: random() < 0.5 ? "accent" : "normal",
      length: "normal",
      slide: bar.steps[index - 1]!.enabled && random() < 0.25,
    });
  }
  return bar;
}

/** A motif that repeats, hypnotic as acid is: one bar three times and an answer, or a two-bar call and response. */
function acidPattern(random: Random, profile: GenreProfile, role: SceneRole): BarPattern[] {
  const motif = acidBar(random, profile, role);
  if (role !== "break" && random() < 0.45) {
    const response = answerBar(motif, random, profile, 3 + Math.floor(random() * 3));
    return [motif, response, structuredClone(motif), answerBar(response, random, profile, 2)];
  }
  return [motif, structuredClone(motif), structuredClone(motif), answerBar(motif, random, profile, 2 + Math.floor(random() * 3))];
}

// ---- the kit -------------------------------------------------------------------------

/** How the closed hats fill the sixteenths between the offbeats. */
type HatStyle = "sixteenths" | "gallop" | "push";
const HAT_STYLES: readonly HatStyle[] = ["sixteenths", "gallop", "push"];

/**
 * A techno groove per scene: four on the floor (none in the break), the clap
 * on two and four, the open hat on the offbeat, closed hats on the sixteenths
 * between as the energy rises, the ride on top in the peak, and a fill at the
 * end of the phrase. Hat style, kick pickups and percussion vary per groove.
 */
function drumPattern(random: Random, profile: GenreProfile, role: SceneRole): BarPattern[] {
  const style = choose(HAT_STYLES, random);
  return Array.from({ length: BARS_PER_SCENE }, (_, barIndex) => drumBar(random, profile, role, barIndex, style));
}

function drumBar(random: Random, profile: GenreProfile, role: SceneRole, barIndex: number, style: HatStyle): BarPattern {
  const bar = emptyBar();
  const set = (index: number, voices: DrumVoice[], dynamics: Step["dynamics"] = "normal") => {
    Object.assign(bar.steps[index]!, { enabled: true, drumVoices: voices, dynamics, length: "normal" });
  };
  const kick = role !== "break";
  const ride = role === "peak" && profile !== "hard";
  const sixteenths = role === "peak" ? 1 : role === "drive" ? (profile === "hard" ? 0.95 : 0.72) : role === "break" ? 0.4 : 0;
  // Gallop: only the sixteenth before each beat; push: only the one after the offbeat.
  const hatSlot = (index: number) => style === "sixteenths" || (style === "gallop" ? index % 4 === 3 : index % 4 === 3 || (index % 4 === 1 && index > 8));
  for (let index = 0; index < 16; index += 1) {
    if (index % 4 === 0) {
      const voices: DrumVoice[] = kick ? ["kick"] : [];
      const backbeat = index === 4 || index === 12;
      if (backbeat && (role === "break" ? index === 12 : role !== "warmup" || barIndex >= 1)) voices.push("clap");
      if (voices.length > 0) set(index, voices, index === 0 && kick ? "accent" : "normal");
    } else if (index % 4 === 2) {
      const open = role !== "warmup" || barIndex >= 2;
      set(index, ride ? ["openHat", "ride"] : [open ? "openHat" : "closedHat"]);
    } else if (hatSlot(index) && random() < sixteenths) {
      set(index, ["closedHat"], "ghost");
    }
  }
  if (role !== "warmup" && role !== "break") {
    // Percussion between the hats: toms in hard, a ghost snare elsewhere.
    if (random() < (profile === "hard" ? 0.45 : 0.3)) set(choose([7, 11], random), [profile === "hard" ? "tom" : "snare"], "ghost");
    // A kick pickup into the next bar.
    if (barIndex % 2 === 1 && random() < (profile === "hard" ? 0.4 : 0.2)) set(14, ["kick", "openHat"]);
  }
  if (barIndex === 1 && role !== "warmup" && random() < 0.35) set(15, ["openHat"]);
  if (barIndex === 3 && role !== "warmup") {
    // A fill into the next phrase: snare (toms in hard and in the break).
    const fill: DrumVoice = profile === "hard" || role === "break" ? "tom" : "snare";
    set(13, [fill], "ghost");
    set(14, [fill]);
    set(15, [fill], "accent");
  }
  return bar;
}

export function activateStep(track: TrackKind, stepIndex: number): Step {
  const next = emptyStep();
  next.enabled = true;
  next.drumVoices = track === "drums" ? defaultDrums(stepIndex) : [];
  next.octave = track === "acid" ? 2 : track === "stab" ? 3 : 4;
  return next;
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
      if (pattern.instrument === "acid") {
        // A 303 changes by accent, octave jump or slide.
        const roll = random();
        if (roll < 0.4) candidate.step.dynamics = candidate.step.dynamics === "accent" ? "normal" : "accent";
        else if (roll < 0.7) candidate.step.octave = candidate.step.octave === 3 ? 2 : 3;
        else candidate.step.slide = !candidate.step.slide;
      } else {
        candidate.step.dynamics = candidate.step.dynamics === "ghost" ? "accent" : "ghost";
      }
    } else if (candidate.step.enabled) {
      Object.assign(candidate.step, emptyStep());
    } else {
      candidate.step.enabled = true;
      const note = pattern.instrument === "acid" ? acidNote(random, "hybrid") : { degree: Math.floor(random() * 7), octave: pattern.instrument === "stab" ? 3 : 4 };
      candidate.step.octave = note.octave;
      candidate.step.degree = note.degree;
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
