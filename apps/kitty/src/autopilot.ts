import type { Action } from "./store/store";
import type { ProjectV1, RootNote, SoundPresetId, TrackKind, TrackMacros } from "./domain/types";
import { ROOT_NOTES, SOUND_PRESETS } from "./domain/types";

/**
 * Auto-Acid: plays acid techno on its own, in arcs of tension. Each arc runs
 * through flow, build, break, peak and cool-down (the first one opens with an
 * intro); the tension of the moment sets the scene, the 303's filter and
 * resonance, which tracks play, the master filter and break and drop. Every
 * arc changes the acid line, now and then its sound or the key, so the music
 * keeps moving.
 *
 * Framework free: `step()` hears one sixteenth and answers with a plan that
 * the app carries out. A bar is planned a beat ahead (step 12), so scene
 * changes, mutes and the drop land on its first beat.
 */
export type AutopilotPhase = "intro" | "groove" | "build" | "break" | "peak" | "cooldown";
export type ArcLength = "short" | "medium" | "long";

export const ARC_LENGTHS: readonly ArcLength[] = ["short", "medium", "long"];
export const AUTOPILOT_PHASES: readonly AutopilotPhase[] = ["intro", "groove", "build", "break", "peak", "cooldown"];
export const PHASE_LABELS: Record<AutopilotPhase, string> = { intro: "Einstieg", groove: "Fluss", build: "Aufbau", break: "Break", peak: "Peak", cooldown: "Abbau" };
export const ARC_LABELS: Record<ArcLength, string> = { short: "Kurz", medium: "Mittel", long: "Lang" };

const PHASE_MESSAGES: Record<AutopilotPhase, string> = {
  intro: "Auto-Acid · Einstieg: der Filter öffnet sich",
  groove: "Auto-Acid · Fluss: die Linie läuft",
  build: "Auto-Acid · Aufbau: die Spannung steigt",
  break: "Auto-Acid · Break: die 303 allein, dann der Riser",
  peak: "Auto-Acid · Peak: alles drin",
  cooldown: "Auto-Acid · Abbau: Luft holen für den nächsten Bogen",
};

const PHASE_BARS: Record<ArcLength, Record<AutopilotPhase, number>> = {
  short: { intro: 4, groove: 8, build: 8, break: 4, peak: 8, cooldown: 4 },
  medium: { intro: 8, groove: 16, build: 16, break: 8, peak: 16, cooldown: 8 },
  long: { intro: 8, groove: 16, build: 24, break: 8, peak: 32, cooldown: 8 },
};

/** Warm-up, drive, break and peak: the four scenes of every project. */
const PHASE_SCENE: Record<AutopilotPhase, number> = { intro: 0, groove: 1, build: 1, break: 2, peak: 3, cooldown: 1 };

/** Tension at the start and at the end of each phase. */
const TENSION: Record<AutopilotPhase, readonly [number, number]> = {
  intro: [0.1, 0.3],
  groove: [0.3, 0.45],
  build: [0.45, 0.88],
  break: [0.88, 1],
  peak: [1, 0.72],
  cooldown: [0.7, 0.3],
};

/** The last bars of the break: kick and acid out, the riser climbs, then the drop. */
export const PRE_DROP_BARS = 2;
const NEXT_PHASE: Record<AutopilotPhase, AutopilotPhase> = { intro: "groove", groove: "build", build: "break", break: "peak", peak: "cooldown", cooldown: "groove" };
/** The autopilot never mutes the kit or the 303. */
const SWITCHED_TRACKS: readonly TrackKind[] = ["stab", "rave", "texture"];

interface Cursor {
  phase: AutopilotPhase;
  bar: number;
  arc: number;
}

export interface AutopilotView {
  phase: AutopilotPhase;
  /** 1-based bar within the phase. */
  bar: number;
  bars: number;
  tension: number;
  rising: boolean;
  arc: number;
}

export interface AutopilotPlan {
  /** Changes to the music, all `auto/` store actions. */
  actions: Action[];
  /** Scene to queue for the next bar line. */
  scene?: number;
  /** Live mutes to set for the next bar line (`true` mutes). */
  mutes?: Partial<Record<TrackKind, boolean>>;
  breakOn?: boolean;
  /** Release the break: the drop lands on the next bar line. */
  drop?: boolean;
  /** Master filter, -1 low-pass … 0 open … 1 high-pass. */
  filter?: number;
  /** Status line for a new phase. */
  message?: string;
}

export interface AutopilotOptions {
  arcLength?: ArcLength;
  random?: () => number;
}

export class Autopilot {
  arcLength: ArcLength;
  private readonly random: () => number;
  private current: Cursor | null = null;
  private planned: Cursor | null = null;
  private beats = 0;
  private lastFilter: number | null = null;
  private readonly mutes = new Map<TrackKind, boolean>();

  constructor(options: AutopilotOptions = {}) {
    this.arcLength = options.arcLength ?? "medium";
    this.random = options.random ?? Math.random;
  }

  get active(): boolean { return this.current !== null || this.planned !== null; }

  /** Tracks the autopilot muted last; handing back, the app lets them play again. */
  get mutedTracks(): TrackKind[] { return [...this.mutes].filter(([, muted]) => muted).map(([track]) => track); }

  /**
   * Begins a run. From silence it opens with the intro and its plan is meant
   * to be carried out before the music starts in `plan.scene`; while music
   * plays it goes straight into the flow.
   */
  start(fromSilence: boolean, project: ProjectV1): AutopilotPlan {
    this.current = null;
    this.beats = 0;
    this.lastFilter = null;
    this.mutes.clear();
    this.planned = { phase: fromSilence ? "intro" : "groove", bar: 0, arc: 0 };
    const plan = emptyPlan();
    this.prepare(this.planned, plan, project);
    plan.filter = this.filterAt(this.planned, 0);
    this.lastFilter = plan.filter;
    return plan;
  }

  stop(): void {
    this.current = null;
    this.planned = null;
  }

  /** One sixteenth (0–15) as it is heard. */
  step(step: number, project: ProjectV1): AutopilotPlan {
    const plan = emptyPlan();
    if (!this.active) return plan;
    if (step === 0 && this.planned) {
      const entering = this.planned;
      if (!this.current || this.current.phase !== entering.phase) plan.message = PHASE_MESSAGES[entering.phase];
      if (entering.phase === "break" && entering.bar === this.bars("break") - PRE_DROP_BARS) plan.breakOn = true;
      this.current = entering;
      this.planned = null;
    }
    const cursor = this.current;
    // Started between bar lines: the first bar, prepared by `start()`, begins at the next one.
    if (!cursor) return plan;
    if (step % 4 === 0) {
      plan.actions.push({ type: "auto/macros", changes: this.macrosFor(cursor, step) });
      this.beats += 1;
    }
    if (step === 12) {
      this.planned = this.advance(cursor);
      this.prepare(this.planned, plan, project);
    }
    const filter = this.filterAt(cursor, step);
    if (this.lastFilter === null || Math.abs(filter - this.lastFilter) > 0.004) {
      plan.filter = filter;
      this.lastFilter = filter;
    }
    return plan;
  }

  /** Where the run stands for the display, or `null` before its first bar. */
  view(step = 0): AutopilotView | null {
    const cursor = this.current ?? this.planned;
    if (!cursor) return null;
    const [from, to] = TENSION[cursor.phase];
    return {
      phase: cursor.phase,
      bar: cursor.bar + 1,
      bars: this.bars(cursor.phase),
      tension: this.current ? this.tensionAt(cursor, step) : from,
      rising: to > from,
      arc: cursor.arc + 1,
    };
  }

  private bars(phase: AutopilotPhase): number { return PHASE_BARS[this.arcLength][phase]; }

  private progress(cursor: Cursor, step: number): number {
    return Math.min(1, (cursor.bar + step / 16) / this.bars(cursor.phase));
  }

  private tensionAt(cursor: Cursor, step: number): number {
    const [from, to] = TENSION[cursor.phase];
    const progress = this.progress(cursor, step);
    // A build climbs slowly at first and steeply at its end.
    const shaped = cursor.phase === "build" ? progress ** 1.6 : progress;
    return from + (to - from) * shaped;
  }

  private advance(cursor: Cursor): Cursor {
    if (cursor.bar + 1 < this.bars(cursor.phase)) return { ...cursor, bar: cursor.bar + 1 };
    const phase = NEXT_PHASE[cursor.phase];
    return { phase, bar: 0, arc: cursor.phase === "cooldown" ? cursor.arc + 1 : cursor.arc };
  }

  /** Everything that has to be in place when the bar of `cursor` begins. */
  private prepare(cursor: Cursor, plan: AutopilotPlan, project: ProjectV1): void {
    const scene = PHASE_SCENE[cursor.phase];
    if (cursor.bar === 0) {
      plan.scene = scene;
      plan.actions.push(...this.editsFor(cursor, project));
      plan.actions.push({ type: "auto/macros", changes: this.macrosFor(cursor, 0) });
      if (cursor.phase === "peak") plan.drop = true;
    }
    const changes: Partial<Record<TrackKind, boolean>> = {};
    for (const [track, muted] of Object.entries(this.mutesFor(cursor)) as [TrackKind, boolean][]) {
      if (this.mutes.get(track) === muted) continue;
      this.mutes.set(track, muted);
      changes[track] = muted;
    }
    if (Object.keys(changes).length > 0) plan.mutes = changes;
  }

  /** New material for a phase, always aimed at the scene that phase plays. */
  private editsFor(cursor: Cursor, project: ProjectV1): Action[] {
    const scene = PHASE_SCENE[cursor.phase];
    const edits: Action[] = [];
    switch (cursor.phase) {
      case "groove":
        if (cursor.arc === 0) break;
        // Every arc a changed 303 line, every third a fresh one in the acid idiom.
        edits.push(cursor.arc % 3 === 0 || this.random() < 0.15
          ? { type: "auto/typical", scene, track: "acid", profile: "acid" }
          : { type: "auto/vary", scene, track: "acid", amount: "bold" });
        edits.push({ type: "auto/vary", scene, track: "drums", amount: "subtle" });
        if (cursor.arc % 2 === 0) edits.push({ type: "auto/preset", track: "acid", value: this.otherPreset(project.soundPresets.acid) });
        if (cursor.arc % 4 === 0) edits.push({ type: "auto/root", value: fourthUp(project.root) });
        break;
      case "build":
        edits.push({ type: "auto/vary", scene, track: "acid", amount: "lively" });
        edits.push({ type: "auto/vary", scene, track: "drums", amount: "lively" });
        break;
      case "break":
        edits.push({ type: "auto/vary", scene, track: "acid", amount: "lively" });
        break;
      case "peak": {
        edits.push({ type: "auto/vary", scene, track: "acid", amount: "lively" });
        const companion: TrackKind = (["stab", "rave", "drums"] as const)[Math.floor(this.random() * 3)] ?? "rave";
        edits.push({ type: "auto/vary", scene, track: companion, amount: "subtle" });
        break;
      }
      default:
        break;
    }
    return edits;
  }

  private otherPreset(current: SoundPresetId): SoundPresetId {
    const others = (SOUND_PRESETS.acid as readonly SoundPresetId[]).filter((preset) => preset !== current);
    return others[Math.floor(this.random() * others.length)] ?? current;
  }

  /** The 303 follows the tension: filter and resonance up, a slow sweep on top that grows with it. */
  private macrosFor(cursor: Cursor, step: number): { scene: number; track: TrackKind; values: Partial<TrackMacros> }[] {
    const scene = PHASE_SCENE[cursor.phase];
    const tension = this.tensionAt(cursor, step);
    const sweepBeats = cursor.phase === "peak" ? 8 : 16;
    const sweep = Math.sin((this.beats / sweepBeats) * Math.PI * 2) * (0.06 + 0.12 * tension);
    const inBreak = cursor.phase === "break";
    return [
      {
        scene,
        track: "acid",
        values: {
          color: round(0.18 + 0.66 * tension + sweep),
          pressure: round(inBreak ? 0.9 + 0.08 * tension : 0.35 + 0.55 * tension),
          motion: round(0.25 + 0.5 * tension),
          space: round(inBreak ? 0.45 : 0.12 + 0.18 * tension),
        },
      },
      // More tension, more rumble under the kick.
      { scene, track: "drums", values: { pressure: round(0.5 + 0.4 * tension), space: round(0.35 + 0.4 * tension) } },
      { scene, track: "texture", values: { motion: round(0.35 + 0.55 * tension) } },
    ];
  }

  private mutesFor(cursor: Cursor): Record<TrackKind, boolean> {
    const progress = this.progress(cursor, 0);
    const muted = new Set<TrackKind>();
    if (cursor.phase === "intro") { muted.add("stab"); muted.add("rave"); }
    if (cursor.phase === "groove") muted.add("rave");
    if (cursor.phase === "build" && progress < 0.5) muted.add("rave");
    if (cursor.phase === "cooldown") {
      muted.add("rave");
      if (progress >= 0.5) muted.add("stab");
    }
    return Object.fromEntries(SWITCHED_TRACKS.map((track) => [track, muted.has(track)])) as Record<TrackKind, boolean>;
  }

  /** Low-pass that opens in the intro and after a cool-down, a high-pass riser at the end of each build. */
  private filterAt(cursor: Cursor, step: number): number {
    const progress = this.progress(cursor, step);
    switch (cursor.phase) {
      case "intro": return signed(-0.45 * (1 - progress));
      case "groove": {
        if (cursor.arc === 0) return 0;
        const opening = Math.min(1, (cursor.bar + step / 16) / 2);
        return signed(-0.3 * (1 - opening));
      }
      case "build": return progress < 0.75 ? 0 : signed(0.4 * ((progress - 0.75) / 0.25));
      case "cooldown": return signed(-0.3 * progress);
      default: return 0;
    }
  }
}

function emptyPlan(): AutopilotPlan { return { actions: [] }; }

function round(value: number): number { return Math.round(Math.max(0, Math.min(1, value)) * 100) / 100; }

function signed(value: number): number { return Math.round(Math.max(-1, Math.min(1, value)) * 100) / 100 || 0; }

function fourthUp(root: RootNote): RootNote {
  return ROOT_NOTES[(ROOT_NOTES.indexOf(root) + 5) % ROOT_NOTES.length] ?? root;
}

/** Bars of one arc after the intro. */
export function arcBars(length: ArcLength): number {
  const bars = PHASE_BARS[length];
  return bars.groove + bars.build + bars.break + bars.peak + bars.cooldown;
}
