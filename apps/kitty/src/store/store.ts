import { createTransportState, createUiState } from "../domain/defaults";
import { activateStep, emptyStep, replaceWithTypical, sanitizeDrumVoices, varyPattern } from "../domain/patterns";
import { sanitizeProject } from "../domain/sanitize";
import type {
  AppState,
  DrumVoice,
  MacroKind,
  ProjectV1,
  RootNote,
  Scale,
  SoundPresetId,
  StepDynamics,
  StepLength,
  TrackKind,
  VariationAmount,
} from "../domain/types";
import { MAX_SWING, MAX_TEMPO, MIN_TEMPO, SOUND_PRESETS } from "../domain/types";

export type Action =
  | { type: "ui/select-scene"; scene: number }
  | { type: "ui/select-track"; track: TrackKind }
  | { type: "ui/select-bar"; bar: number }
  | { type: "ui/select-step"; bar: number; step: number }
  | { type: "ui/toggle-lock"; bar: number }
  | { type: "ui/variation-amount"; amount: VariationAmount }
  | { type: "transport/update"; update: Partial<AppState["transport"]> }
  | { type: "autosave/status"; status: AppState["autosave"] }
  | { type: "project/tempo"; value: number }
  | { type: "project/root"; value: RootNote }
  | { type: "project/scale"; value: Scale }
  | { type: "project/swing"; value: number }
  | { type: "project/master"; value: number }
  | { type: "project/preset"; track: TrackKind; value: SoundPresetId }
  | { type: "mix/mute"; track: TrackKind }
  | { type: "mix/solo"; track: TrackKind }
  | { type: "mix/volume"; track: TrackKind; value: number }
  | { type: "step/press"; bar: number; step: number }
  | { type: "step/disable" }
  | { type: "step/drum-voice"; voice: DrumVoice }
  | { type: "step/degree"; value: number }
  | { type: "step/octave"; value: number }
  | { type: "step/dynamics"; value: StepDynamics }
  | { type: "step/length"; value: StepLength }
  | { type: "step/slide"; value: boolean }
  | { type: "track/macro"; macro: MacroKind; value: number }
  | { type: "track/vary" }
  | { type: "track/typical" }
  | { type: "history/undo" }
  | { type: "history/redo" };

export type StoreListener = (state: AppState, action: Action) => void;
const HISTORY_LIMIT = 100;

export class KittyStore {
  private state: AppState;
  private readonly listeners = new Set<StoreListener>();
  private undoStack: ProjectV1[] = [];
  private redoStack: ProjectV1[] = [];

  constructor(project: ProjectV1) {
    this.state = {
      project: sanitizeProject(project),
      ui: createUiState(),
      transport: createTransportState(),
      canUndo: false,
      canRedo: false,
      autosave: "ready",
    };
  }

  getState(): Readonly<AppState> { return this.state; }

  subscribe(listener: StoreListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  replaceProject(project: ProjectV1): void {
    this.state = {
      project: sanitizeProject(project),
      ui: createUiState(),
      transport: createTransportState(),
      canUndo: false,
      canRedo: false,
      autosave: "ready",
    };
    this.undoStack = [];
    this.redoStack = [];
    this.emit({ type: "autosave/status", status: "ready" });
  }

  dispatch(action: Action): void {
    if (action.type === "history/undo") return this.undo(action);
    if (action.type === "history/redo") return this.redo(action);
    const before = structuredClone(this.state.project);
    const changed = this.reduce(action);
    if (changed) {
      this.undoStack.push(before);
      if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
      this.redoStack = [];
      this.state.canUndo = true;
      this.state.canRedo = false;
      this.state.autosave = "saving";
    }
    this.emit(action);
  }

  private reduce(action: Action): boolean {
    const { project, ui } = this.state;
    switch (action.type) {
      case "ui/select-scene": ui.selectedScene = clamp(action.scene, 0, 3); ui.selectedStep = null; return false;
      case "ui/select-track": ui.selectedTrack = action.track; ui.selectedStep = null; return false;
      case "ui/select-bar": ui.selectedBar = clamp(action.bar, 0, 3); ui.selectedStep = null; return false;
      case "ui/select-step": ui.selectedBar = clamp(action.bar, 0, 3); ui.selectedStep = clamp(action.step, 0, 15); return false;
      case "ui/toggle-lock": { const bar = clamp(action.bar, 0, 3); ui.locks[ui.selectedTrack][bar] = !ui.locks[ui.selectedTrack][bar]; return false; }
      case "ui/variation-amount": ui.variationAmount = action.amount; return false;
      case "transport/update": Object.assign(this.state.transport, action.update); return false;
      case "autosave/status": this.state.autosave = action.status; return false;
      case "project/tempo": return assign(project, "tempo", clampNumber(action.value, MIN_TEMPO, MAX_TEMPO));
      case "project/root": return assign(project, "root", action.value);
      case "project/scale": return assign(project, "scale", action.value);
      case "project/swing": return assign(project, "swing", clampNumber(action.value, 0, MAX_SWING));
      case "project/master": return assign(project, "masterVolume", clampNumber(action.value, 0, 1));
      case "project/preset": {
        if (!(SOUND_PRESETS[action.track] as readonly string[]).includes(action.value) || project.soundPresets[action.track] === action.value) return false;
        (project.soundPresets as Record<TrackKind, SoundPresetId>)[action.track] = action.value;
        return true;
      }
      case "mix/mute": { const mix = project.mix.find((entry) => entry.instrument === action.track); if (!mix) return false; mix.muted = !mix.muted; if (mix.muted) mix.solo = false; return true; }
      case "mix/solo": { const mix = project.mix.find((entry) => entry.instrument === action.track); if (!mix) return false; mix.solo = !mix.solo; if (mix.solo) mix.muted = false; return true; }
      case "mix/volume": { const mix = project.mix.find((entry) => entry.instrument === action.track); return mix ? assign(mix, "volume", clampNumber(action.value, 0, 1)) : false; }
      case "step/press": {
        const bar = clamp(action.bar, 0, 3);
        const stepIndex = clamp(action.step, 0, 15);
        const step = findStep(this.state, bar, stepIndex);
        ui.selectedBar = bar;
        ui.selectedStep = stepIndex;
        if (!step || step.enabled) return false;
        Object.assign(step, activateStep(ui.selectedTrack, stepIndex));
        return true;
      }
      case "step/disable": {
        const step = selectedStep(this.state);
        if (!step?.enabled) return false;
        Object.assign(step, emptyStep());
        return true;
      }
      case "step/drum-voice": return this.toggleDrumVoice(action.voice);
      case "step/degree": { const step = selectedStep(this.state); return step?.enabled ? assign(step, "degree", clamp(action.value, 0, 6)) : false; }
      case "step/octave": { const step = selectedStep(this.state); return step?.enabled ? assign(step, "octave", clamp(action.value, 1, 5)) : false; }
      case "step/dynamics": { const step = selectedStep(this.state); return step?.enabled ? assign(step, "dynamics", action.value) : false; }
      case "step/length": { const step = selectedStep(this.state); return step?.enabled ? assign(step, "length", action.value) : false; }
      case "step/slide": { const step = selectedStep(this.state); return step?.enabled && ui.selectedTrack === "acid" ? assign(step, "slide", action.value) : false; }
      case "track/macro": { const pattern = selectedPattern(this.state); return pattern ? assign(pattern.macros, action.macro, clampNumber(action.value, 0, 1)) : false; }
      case "track/vary": { const pattern = selectedPattern(this.state); return pattern ? varyPattern(pattern, ui.variationAmount, ui.locks[ui.selectedTrack]) : false; }
      case "track/typical": { const pattern = selectedPattern(this.state); const scene = project.scenes[ui.selectedScene]; return pattern && scene ? replaceWithTypical(pattern, project.profile, scene.role, ui.locks[ui.selectedTrack]) : false; }
    }
    return false;
  }

  private toggleDrumVoice(voice: DrumVoice): boolean {
    const step = selectedStep(this.state);
    if (!step?.enabled || this.state.ui.selectedTrack !== "drums") return false;
    if (step.drumVoices.includes(voice)) {
      if (step.drumVoices.length === 1) return false;
      step.drumVoices = step.drumVoices.filter((entry) => entry !== voice);
      return true;
    }
    if (!canAddDrumVoice(step.drumVoices, voice)) return false;
    step.drumVoices = sanitizeDrumVoices([...step.drumVoices, voice], step.drumVoices);
    return true;
  }

  private undo(action: Action): void {
    const previous = this.undoStack.pop();
    if (!previous) return;
    this.redoStack.push(structuredClone(this.state.project));
    this.state.project = previous;
    this.state.canUndo = this.undoStack.length > 0;
    this.state.canRedo = true;
    this.state.autosave = "saving";
    this.emit(action);
  }

  private redo(action: Action): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(structuredClone(this.state.project));
    this.state.project = next;
    this.state.canUndo = true;
    this.state.canRedo = this.redoStack.length > 0;
    this.state.autosave = "saving";
    this.emit(action);
  }

  private emit(action: Action): void { for (const listener of this.listeners) listener(this.state, action); }
}

function assign<T extends object, K extends keyof T>(target: T, key: K, value: T[K]): boolean {
  if (target[key] === value) return false;
  target[key] = value;
  return true;
}

function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, Math.round(value))); }
function clampNumber(value: number, min: number, max: number): number { return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min; }

export function selectedPattern(state: AppState) {
  return state.project.scenes[state.ui.selectedScene]?.tracks.find((entry) => entry.instrument === state.ui.selectedTrack);
}

export function findStep(state: AppState, bar: number, step: number) { return selectedPattern(state)?.bars[bar]?.steps[step]; }
export function selectedStep(state: AppState) { return state.ui.selectedStep === null ? undefined : findStep(state, state.ui.selectedBar, state.ui.selectedStep); }

export function canAddDrumVoice(active: readonly DrumVoice[], voice: DrumVoice): boolean {
  if (active.includes(voice)) return true;
  if (active.length >= 2) return false;
  if ((voice === "kick" && active.includes("tom")) || (voice === "tom" && active.includes("kick"))) return false;
  if ((voice === "closedHat" && active.includes("openHat")) || (voice === "openHat" && active.includes("closedHat"))) return false;
  return true;
}

export function effectiveTrackGains(project: ProjectV1): Record<TrackKind, number> {
  const solo = project.mix.some((entry) => entry.solo && !entry.muted);
  return Object.fromEntries(project.mix.map((entry) => [
    entry.instrument,
    entry.muted || (solo && !entry.solo) ? 0 : audibleFaderGain(entry.volume),
  ])) as Record<TrackKind, number>;
}

function audibleFaderGain(value: number): number {
  const safe = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  return safe * safe;
}
