import { Cues, MasterRecorder, playThroughSilentSwitch, Transport, type Recording } from "klangwerk";
import {
  atStep, connect, currentSound, currentTime, DetuneSource, FmVoice, FrequencyEnvelope, Gain, LeanChorus, LeanEnvelope, LeanFilter, LeanStereoWidener, LeanTone, LeanVibrato,
  midiFrequency, Noise, NoiseVoice, now, OneShotTone, Panner, setBpm, SleepyOutput, soundContext, SoundNode, swapSound, toFrequency, toSeconds, useContext,
  type BasicWave, type Sound, type ToneSpec,
} from "klangwerk/tone";
import { createFactoryProject } from "../domain/defaults";
import { scaleChord, scaleDegreeMidi } from "../domain/music";
import { acidCutoff, acidDrive, acidEnvelopeOctaves, acidStepParameters, presetDefinition, safeEffectParameters } from "../domain/sound-presets";
import { allowsRatchet, loopPosition, sceneSteps, stepChance, stepRatchet } from "../domain/patterns";
import type { DrumVoice, ProjectV1, SoundPresetId, SoundPresetMap, Step, TrackKind, TrackMacros, TrackPattern } from "../domain/types";
import { SOUND_PRESETS, TRACK_KINDS } from "../domain/types";
import { effectiveTrackGains } from "../store/store";
import {
  acidLegatoContext,
  dbMeterValue,
  duckEnvelope,
  faderGain,
  kickFrequency,
  membraneOctaves,
  performanceOffsetSeconds,
  positionalVelocity,
  riserDurationSeconds,
  rmsToDb,
  stabVoicing,
  stepDurationSeconds,
} from "./polish";
import {
  applyTrackGraphParameters,
  CharacterSaturator,
  createMasterGraph,
  createTrackGraph,
  setTrackGraphVolume,
  type TrackGraph,
} from "./graph";
import { AcidDrive } from "./distortion";
import { MetalNoise } from "./metal";
import { BarQueuedTransport, type SequencerPosition } from "./transport";
import type { PerformanceFilter } from "./performance";

export interface AudioStatusEvent { status: "idle" | "starting" | "playing" | "suspended" | "error"; message: string; }
export interface PlayheadEvent extends SequencerPosition { peak: number; trackPeaks: Record<TrackKind, number>; triggeredTracks: TrackKind[]; ducking: boolean; acidLegato: boolean; chainNext: number | null; }

interface TrackStrip extends TrackGraph {
  meter: PeakMeter;
  parameterKey: string;
}

interface PeakMeter {
  node: AnalyserNode;
  getValue(): number;
  dispose(): void;
}

interface PlannedStep {
  pattern: TrackPattern;
  step: Step;
  at: { bar: number; step: number };
}

interface VoiceBank {
  trigger(notes: number[], step: Step, time: number, velocity: number, macros: TrackMacros, context: TriggerContext): void;
  release(time?: number): void;
  dispose(): void;
}

interface TriggerContext {
  tempo: number;
  scene: number;
  bar: number;
  step: number;
  legato: boolean;
  continuesLegato: boolean;
}

/** Silence margin after a bank's envelopes have released before it is disconnected. */
const SLEEP_MARGIN_SECONDS = 0.5;
/** Longest drum decay (sub tail 0.68 s + release 0.32 s) plus margin. */
const DRUM_TAIL_SECONDS = 1.5;

/** Live-only layer on top of the project: nothing here is saved or undoable. */
export interface PerformanceState {
  /** Tracks silenced right now. */
  muted: TrackKind[];
  /** Tracks whose mute changes at the next bar line. */
  pending: TrackKind[];
  breakActive: boolean;
  /** The break ends (the drop) at the next bar line. */
  dropPending: boolean;
}

export interface EngineOptions {
  /** Renders inside an offline context: no context-state checks, meters, draw callbacks or sleeping banks. */
  offline?: boolean;
  /** Offline only: each track's stereo output on its own channel pair instead of the master mix. */
  stems?: boolean;
}

/** What an offline render plays: the start scene, the chain setting and the number of sixteenth steps. */
export interface RenderPlan {
  startScene: number;
  chainRepeats: number | null;
  steps: number;
}

export const VOICE_LIMITS: Record<TrackKind, number> = { drums: 6, acid: 1, stab: 4, rave: 5, texture: 2 };

export class ToneAudioEngine {
  private project: ProjectV1;
  private initialized = false;
  private graphReady: Promise<void> | null = null;
  private strips: Record<TrackKind, TrackStrip> | null = null;
  private masterNodes: SoundNode[] = [];
  private masterFader: Gain | null = null;
  private masterPerformance: PerformanceFilter | null = null;
  private readonly performanceMuted = new Set<TrackKind>();
  private readonly performancePending = new Map<TrackKind, boolean>();
  private breakActive = false;
  private dropPending = false;
  private readonly performanceListeners = new Set<(state: PerformanceState) => void>();
  private readonly recorder = new MasterRecorder(() => undefined);
  private masterMeter: PeakMeter | null = null;
  private readonly banks = new Map<string, VoiceBank>();
  private activePresets: Partial<Record<TrackKind, SoundPresetId>> = {};
  private appliedTempo: number | null = null;
  private tempoOverride: number | null = null;
  private appliedMasterVolume: number | null = null;
  /** Steps an offline render still plays (`null` live). */
  private offlineSteps: number | null = null;
  /** The context this engine plays in (made current while it builds or schedules, as Tone's global one was). */
  private sound: Sound | null = null;
  private ownContext: AudioContext | null = null;
  private cues: Cues | null = null;
  private readonly transport = new Transport({
    step: (_step, time) => this.withSound(() => atStep(this.transport.nextTime, () => this.tick(time))),
    stepDuration: () => 60 / this.tempo / 4,
    // Tone's swing on sixteenths: the odd ones lean back by swing · 2/3 of a sixteenth.
    swing: () => (this.project.swing * 2) / 3,
    lookahead: 0.1,
  });
  private meterFrame: number | null = null;
  private lastMeterRead = 0;
  private peak = 0;
  private trackPeaks = zeroPeaks();
  private readonly clock = new BarQueuedTransport();
  private readonly playheadListeners = new Set<(event: PlayheadEvent) => void>();
  private readonly statusListeners = new Set<(event: AudioStatusEvent) => void>();

  constructor(project: ProjectV1, private readonly options: EngineOptions = {}) { this.project = structuredClone(project); }

  async initialize(): Promise<void> {
    // Already prepared (e.g. recording or MIDI while music plays): report nothing new.
    if (this.initialized && this.sound?.context.state === "running") return;
    this.emitStatus("starting", "Audio wird vorbereitet …");
    // iPhones and iPads: play even with the ring/silent switch on silent (live sound only).
    if (!this.options.offline) playThroughSilentSwitch();
    this.attachContext();
    if (this.ownContext && this.ownContext.state !== "running") await this.ownContext.resume().catch(() => undefined);
    if (!this.initialized) {
      this.graphReady ??= this.withSound(() => this.createGraph()).finally(() => { this.graphReady = null; });
      await this.graphReady;
    }
    if (this.context.state !== "running" && !(this.context instanceof OfflineAudioContext)) {
      this.emitStatus("suspended", "Audio ist pausiert – Start erneut anklicken");
      return;
    }
    this.emitStatus("idle", "Audio bereit");
  }

  /** `at` (milliseconds since the epoch) starts in step with a coupled app. */
  async start(scene: number, at?: number): Promise<void> {
    try {
      await this.initialize();
      if (this.context.state !== "running") return;
      this.transport.halt();
      this.clock.start(scene);
      this.withSound(() => {
        this.applyProject();
        // The first steps come with the clock's next beat, as with Tone's transport.
        this.transport.begin(this.context, at === undefined ? now() + 0.05 : contextTimeAt(at));
      });
      this.emitStatus("playing", "Wiedergabe läuft");
    } catch (error) {
      this.stop(false);
      this.emitStatus("error", error instanceof Error ? `Audio konnte nicht starten: ${error.message}` : "Audio konnte nicht gestartet werden");
    }
  }

  stop(emit = true): void {
    this.resetPerformance();
    this.transport.halt();
    this.cues?.cancel();
    this.clock.reset();
    if (this.sound) this.withSound(() => this.releaseAll());
    this.peak = 0;
    this.trackPeaks = zeroPeaks();
    if (emit) this.emitStatus("idle", "Gestoppt");
  }

  /**
   * Plays one step once while the music is stopped, so a step that was just
   * set or changed can be heard. Chance is ignored and the note starts fresh.
   */
  async audition(scene: number, track: TrackKind, bar: number, stepIndex: number): Promise<void> {
    if (this.options.offline || this.transport.running) return;
    await this.initialize();
    if (this.transport.running || this.context.state !== "running") return;
    const pattern = this.patternFor(scene, track);
    const step = pattern?.bars[bar]?.steps[stepIndex];
    if (!pattern || !step?.enabled) return;
    if (effectiveTrackGains(this.project)[track] <= 0) return;
    this.withSound(() => {
      this.applyProject();
      this.triggerTrack(track, { pattern, step: { ...step, slide: false }, at: { bar, step: stepIndex } }, { scene, bar, step: stepIndex, switched: false, pass: 0 }, now() + 0.03, true);
    });
  }

  /** Test hook: builds the graph and the voice banks of the current presets, as a playing session would. */
  async prepareAllVoices(): Promise<void> {
    this.attachContext();
    if (!this.initialized) await this.withSound(() => this.createGraph());
    this.withSound(() => { for (const track of TRACK_KINDS) this.bankFor(track); });
  }

  queueScene(scene: number): number | null { return this.clock.queue(scene); }

  setSceneChain(repeats: number | null): void { this.clock.setChain(repeats); }

  setPerformanceMute(track: TrackKind, muted: boolean): void {
    if (this.performanceMuted.has(track) === muted) this.performancePending.delete(track);
    else this.performancePending.set(track, muted);
    // Without a running transport there is no bar line to wait for.
    if (!this.transport.running) this.applyPendingMutes();
    this.emitPerformance();
  }

  setBreak(active: boolean): void {
    const now = this.sound ? this.withSound(nowTime) : 0;
    if (active) {
      this.breakActive = true;
      this.dropPending = false;
      this.masterPerformance?.startRise(now, (2 * 240) / this.tempo);
    } else if (this.breakActive) {
      this.dropPending = true;
      if (!this.transport.running) this.drop(now);
    }
    this.emitPerformance();
  }

  setPerformanceFilter(value: number): void { this.masterPerformance?.setFilter(value); }

  onPerformance(listener: (state: PerformanceState) => void): () => void {
    this.performanceListeners.add(listener);
    return () => this.performanceListeners.delete(listener);
  }

  async startRecording(): Promise<void> {
    if (!this.initialized) await this.initialize();
    const fader = this.masterFader;
    if (this.context.state !== "running" || !(this.context instanceof AudioContext) || !fader) throw new Error("Audio ist pausiert");
    await this.recorder.start(this.context, fader.output);
  }

  stopRecording(): Promise<Recording> { return this.recorder.stop(); }

  get recordingSeconds(): number { return this.recorder.active ? this.recorder.seconds : 0; }

  private applyPendingMutes(): void {
    for (const [track, muted] of this.performancePending) {
      if (muted) this.performanceMuted.add(track);
      else this.performanceMuted.delete(track);
    }
    this.performancePending.clear();
  }

  private drop(time: number): void {
    this.breakActive = false;
    this.dropPending = false;
    this.masterPerformance?.endRise(time);
  }

  private resetPerformance(): void {
    this.performanceMuted.clear();
    this.performancePending.clear();
    if (this.breakActive || this.dropPending) this.drop(this.sound ? this.withSound(nowTime) : 0);
    if (this.sound) this.withSound(() => this.masterPerformance?.setFilter(0));
    this.emitPerformance();
  }

  private emitPerformance(): void {
    const state: PerformanceState = { muted: [...this.performanceMuted], pending: [...this.performancePending.keys()], breakActive: this.breakActive, dropPending: this.dropPending };
    for (const listener of this.performanceListeners) listener(state);
  }

  /** An external MIDI clock's tempo replaces the project tempo until `null`; the project keeps its own. */
  setTempoOverride(bpm: number | null): void {
    this.tempoOverride = bpm === null ? null : Math.max(40, Math.min(240, bpm));
    if (this.initialized) this.withSound(() => this.applyProject());
  }

  private get tempo(): number { return this.tempoOverride ?? this.project.tempo; }

  /** Builds the full signal path in the current (offline) context and schedules `plan` on its transport. */
  async scheduleOffline(plan: RenderPlan): Promise<void> {
    if (!this.options.offline) throw new Error("scheduleOffline braucht eine Offline-Engine");
    this.attachContext();
    this.withSound(() => setBpm(this.project.tempo));
    this.appliedTempo = this.project.tempo;
    this.clock.setChain(plan.chainRepeats);
    this.clock.start(plan.startScene);
    await this.withSound(() => this.createGraph());
    this.offlineSteps = plan.steps;
    this.transport.begin(this.context, 0);
  }

  /** Schedules an offline render up to `seconds` (see `scheduleOffline`). */
  renderUntil(seconds: number): void {
    this.transport.renderUntil(seconds);
  }

  syncProject(project: ProjectV1): void {
    this.project = structuredClone(project);
    if (this.initialized) this.withSound(() => this.applyProject());
  }

  onPlayhead(listener: (event: PlayheadEvent) => void): () => void { this.playheadListeners.add(listener); return () => this.playheadListeners.delete(listener); }
  onStatus(listener: (event: AudioStatusEvent) => void): () => void { this.statusListeners.add(listener); return () => this.statusListeners.delete(listener); }

  dispose(): void {
    if (this.initialized || this.transport.running) this.stop(false);
    else this.clock.reset();
    if (this.meterFrame !== null) cancelAnimationFrame(this.meterFrame);
    if (this.sound) {
      this.withSound(() => {
        for (const bank of this.banks.values()) bank.dispose();
        Object.values(this.strips ?? {}).forEach((strip) => {
          strip.nodes.forEach((node) => node.dispose());
          strip.meter.dispose();
        });
        this.masterNodes.forEach((node) => node.dispose());
      });
    }
    this.banks.clear();
    this.transport.dispose();
    this.masterMeter?.dispose();
    this.strips = null;
    this.masterNodes = [];
    this.masterFader = null;
    this.masterPerformance = null;
    this.masterMeter = null;
    this.activePresets = {};
    this.appliedTempo = null;
    this.appliedMasterVolume = null;
    this.initialized = false;
  }

  private async createGraph(): Promise<void> {
    const meter = createPeakMeter();
    // Stems skip the master: its output goes nowhere and each strip feeds its own channel pair.
    const master = this.options.stems
      ? createMasterGraph(new Gain(0), this.project.masterVolume)
      : createMasterGraph(this.context.destination, this.project.masterVolume, meter.node);
    this.masterNodes = master.nodes;
    this.masterFader = master.fader;
    this.masterPerformance = master.performance;
    this.masterMeter = meter;
    const gains = effectiveTrackGains(this.project);
    const strips = {} as Record<TrackKind, TrackStrip>;
    for (const track of TRACK_KINDS) {
      const macros = this.patternFor(this.clock.runningScene, track)?.macros ?? { color: 0.5, pressure: 0.5, space: 0.5, motion: 0.5, density: 0.5 };
      const trackMeter = createPeakMeter();
      const graph = createTrackGraph(track, this.project.soundPresets[track], macros, gains[track], master.input, trackMeter.node);
      strips[track] = { ...graph, meter: trackMeter, parameterKey: trackParameterKey(this.project.soundPresets[track], macros, false) };
    }
    if (this.options.stems) connectStems(TRACK_KINDS.map((track) => strips[track].gain));
    this.strips = strips;
    await Promise.all(Object.values(strips).map((strip) => strip.ready));
    if (this.strips !== strips) throw new Error("Audio-Vorbereitung wurde abgebrochen");
    this.initialized = true;
    if (!this.options.offline) this.monitorMeters();
    this.applyProject();
  }

  private applyProject(): void {
    // The transport reads tempo and swing for every step; note values follow the tempo from here.
    if (this.appliedTempo !== this.tempo) {
      setBpm(this.tempo);
      this.appliedTempo = this.tempo;
    }
    if (this.appliedMasterVolume !== this.project.masterVolume) {
      this.masterFader?.gain.rampTo(faderGain(this.project.masterVolume), 0.04);
      this.appliedMasterVolume = this.project.masterVolume;
    }
    const gains = effectiveTrackGains(this.project);
    const playing = this.transport.running;
    for (const track of TRACK_KINDS) {
      const strip = this.strips?.[track];
      if (!strip) continue;
      setTrackGraphVolume(strip, gains[track], 0.03);
      const macros = this.patternFor(this.clock.runningScene, track)?.macros;
      const preset = this.project.soundPresets[track];
      if (macros && (!playing || this.activePresets[track] === preset)) {
        this.activePresets[track] = preset;
        this.applyMacros(strip, macros, track, preset);
      }
    }
  }

  private applyMacros(strip: TrackStrip, macros: TrackMacros, track: TrackKind, preset: SoundPresetId, accent = false, time?: number): void {
    const parameterKey = trackParameterKey(preset, macros, accent);
    if (strip.parameterKey === parameterKey) return;
    strip.parameterKey = parameterKey;
    const duration = time === undefined ? 0.08 : 0.025;
    applyTrackGraphParameters(strip, track, preset, macros, duration, time, accent);
  }

  private tick(time: number): void {
    if (this.offlineSteps !== null) {
      if (this.offlineSteps <= 0) return;
      this.offlineSteps -= 1;
    }
    if (!this.options.offline && this.context.state !== "running") {
      this.stop(false);
      this.emitStatus("suspended", "Audio wurde vom Browser pausiert – Start erneut anklicken");
      return;
    }
    const position = this.clock.next();
    if (position.switched) this.applyProject();
    if (position.step === 0 && (this.performancePending.size > 0 || this.dropPending)) {
      this.applyPendingMutes();
      if (this.dropPending) this.drop(time);
      if (!this.options.offline) this.cues?.at(time, () => this.emitPerformance());
    }
    const plays = this.plannedSteps(position);
    const ducking = this.hasAudibleKick(plays.get("drums"));
    if (ducking) this.triggerDucking(time);
    const acidLegato = this.hasAcidLegato(plays.get("acid"));
    const triggeredTracks = TRACK_KINDS.filter((track) => this.triggerTrack(track, plays.get(track), position, time));
    if (this.options.offline) return;
    const chainNext = this.clock.chainNext;
    this.cues?.at(time, () => {
      const event = { ...position, peak: this.peak, trackPeaks: { ...this.trackPeaks }, triggeredTracks, ducking, acidLegato, chainNext };
      for (const listener of this.playheadListeners) listener(event);
    });
  }

  /**
   * What each track plays this sixteenth: its own loop position (tracks with a
   * shorter loop run on against the scene) and one chance roll, which ducking,
   * the acid legato hint and the trigger then share.
   */
  private plannedSteps(position: SequencerPosition): Map<TrackKind, PlannedStep> {
    const plays = new Map<TrackKind, PlannedStep>();
    const total = sceneSteps(position);
    const gains = effectiveTrackGains(this.project);
    for (const track of TRACK_KINDS) {
      const pattern = this.patternFor(position.scene, track);
      if (!pattern || gains[track] <= 0 || this.performanceMuted.has(track) || (this.breakActive && track === "acid")) continue;
      const at = loopPosition(pattern.loopSteps, total);
      const planned = pattern.bars[at.bar]?.steps[at.step];
      if (!planned?.enabled) continue;
      if (stepChance(planned) < 1 && Math.random() >= stepChance(planned)) continue;
      // The break takes the kick out; the rest of the kit keeps the pulse.
      const step = this.breakActive && track === "drums" ? { ...planned, drumVoices: planned.drumVoices.filter((voice) => voice !== "kick") } : planned;
      if (track === "drums" && step.drumVoices.length === 0) continue;
      plays.set(track, { pattern, step, at });
    }
    return plays;
  }

  /** `single` plays the step on its own (an audition): no slide from or into its neighbours. */
  private triggerTrack(track: TrackKind, play: PlannedStep | undefined, position: SequencerPosition, time: number, single = false): boolean {
    if (!play) return false;
    const { pattern, step, at } = play;
    const preset = this.project.soundPresets[track];
    const strip = this.strips?.[track];
    if (!strip) return false;
    this.activePresets[track] = preset;
    this.applyMacros(strip, pattern.macros, track, preset, track === "acid" && step.dynamics === "accent", time);
    const velocity = clamp01(dynamicsVelocity(step) * (0.78 + pattern.macros.density * 0.2) * positionalVelocity(at.bar, at.step));
    const bank = this.bankFor(track);
    const hits = allowsRatchet(track) ? stepRatchet(step) : 1;
    const legato = track === "acid" && hits === 1 && !single ? acidLegatoContext(pattern.bars, at.bar, at.step, pattern.loopSteps) : { legato: false, continues: false };
    const context: TriggerContext = {
      tempo: this.tempo,
      scene: position.scene,
      bar: at.bar,
      step: at.step,
      legato: legato.legato,
      continuesLegato: legato.continues,
    };
    // The kit hears the key's root: the kick tunes itself to it.
    const notes = track === "drums" ? [scaleDegreeMidi(this.project.root, this.project.scale, 0, 1)]
      : track === "stab" ? stabVoicing(preset as SoundPresetMap["stab"], scaleChord(this.project.root, this.project.scale, step.degree, step.octave))
        : [scaleDegreeMidi(this.project.root, this.project.scale, step.degree, step.octave)];
    const triggerTime = time + (track === "drums" ? 0 : performanceOffsetSeconds(track));
    if (hits === 1) {
      bank.trigger(notes, step, triggerTime, velocity, pattern.macros, context);
      return true;
    }
    // A ratchet splits the sixteenth into even, slightly softer repeats with short notes.
    const spacing = 15 / this.tempo / hits;
    const short: Step = { ...step, length: "short", slide: false };
    for (let hit = 0; hit < hits; hit += 1) {
      bank.trigger(notes, short, triggerTime + hit * spacing, velocity * (hit === 0 ? 1 : 0.84), pattern.macros, context);
    }
    return true;
  }

  private bankFor(track: TrackKind): VoiceBank {
    const preset = this.project.soundPresets[track];
    const key = `${track}:${preset}`;
    const existing = this.banks.get(key);
    if (existing) return existing;
    const destination = this.strips?.[track].input;
    if (!destination) throw new Error("Audio-Signalweg ist nicht initialisiert");
    const bank = createVoiceBank(track, preset, destination, this.options.offline ?? false);
    this.banks.set(key, bank);
    return bank;
  }

  private patternFor(scene: number, track: TrackKind) { return this.project.scenes[scene]?.tracks.find((entry) => entry.instrument === track); }
  private releaseAll(): void { for (const bank of this.banks.values()) bank.release(); }

  private hasAudibleKick(play: PlannedStep | undefined): boolean {
    return Boolean(play?.step.drumVoices.includes("kick"));
  }

  private hasAcidLegato(play: PlannedStep | undefined): boolean {
    return Boolean(play && stepRatchet(play.step) === 1 && acidLegatoContext(play.pattern.bars, play.at.bar, play.at.step, play.pattern.loopSteps).legato);
  }

  private triggerDucking(time: number): void {
    for (const track of TRACK_KINDS) {
      if (track === "drums") continue;
      const gain = this.strips?.[track].duck.gain;
      if (!gain) continue;
      const envelope = duckEnvelope(track, this.tempo);
      gain.cancelAndHoldAtTime(time);
      gain.linearRampToValueAtTime(envelope.gain, time + envelope.attack);
      gain.setValueAtTime(envelope.gain, time + envelope.attack + envelope.hold);
      gain.exponentialRampToValueAtTime(1, time + envelope.end);
    }
  }

  private monitorMeters(timestamp = performance.now()): void {
    if (!this.initialized) return;
    if (timestamp - this.lastMeterRead >= 32) {
      this.lastMeterRead = timestamp;
      this.peak = this.masterMeter?.getValue() ?? 0;
      for (const track of TRACK_KINDS) this.trackPeaks[track] = this.strips?.[track].meter.getValue() ?? 0;
    }
    this.meterFrame = requestAnimationFrame((nextTimestamp) => this.monitorMeters(nextTimestamp));
  }

  /**
   * The context this engine plays in: offline engines take the current one
   * (made current by the render or test); live ones make an AudioContext on
   * the first tap and keep it current, as Tone's global context was.
   */
  private attachContext(): void {
    if (this.sound) return;
    if (!this.options.offline) {
      const context = new AudioContext({ latencyHint: "interactive" });
      this.ownContext = context;
      useContext(context);
      this.cues = new Cues(() => context.currentTime);
    }
    this.sound = currentSound();
  }

  private get context(): BaseAudioContext {
    if (!this.sound) throw new Error("initialize() first");
    return this.sound.context;
  }

  /** Runs `action` with this engine's context current. */
  private withSound<T>(action: () => T): T {
    const previous = swapSound(this.sound);
    try {
      return action();
    } finally {
      swapSound(previous);
    }
  }

  private emitStatus(status: AudioStatusEvent["status"], message: string): void { for (const listener of this.statusListeners) listener({ status, message }); }
}

/** How much of the kit's noise the hats get on top of their metal. */
const HAT_NOISE_LEVEL = 0.35;

function createDrumBank(preset: SoundPresetMap["drums"], destination: SoundNode, alwaysAwake: boolean): VoiceBank {
  const definition = presetDefinition("drums", preset);
  const recipe = definition.synthesis;
  const output = new Gain(definition.level);
  const sleep = new SleepyOutput(output, destination, alwaysAwake);
  const snareFilter = new LeanFilter({ type: "highpass", frequency: recipe.snare.highpass, rolloff: -12 });
  const panScale = preset === "steel" ? 1.7 : preset === "rumble" ? 0.42 : 1;
  const snarePan = new Panner(-0.08 * panScale).connect(output);
  snareFilter.connect(snarePan);
  // A 909 clap is band-passed noise around a kilohertz.
  const clapFilter = new LeanFilter({ type: "bandpass", frequency: Math.max(900, recipe.clap.highpass * 2.2), Q: 0.8, rolloff: -24 });
  const clapPan = new Panner(0.17 * panScale).connect(output);
  clapFilter.connect(clapPan);
  const closedHatFilter = new LeanFilter({ type: "highpass", frequency: recipe.hats.closedHighpass, rolloff: -24 });
  const closedHatPan = new Panner(-0.23 * panScale).connect(output);
  closedHatFilter.connect(closedHatPan);
  const openHatFilter = new LeanFilter({ type: "highpass", frequency: recipe.hats.openHighpass, rolloff: -24 });
  const openHatPan = new Panner(0.27 * panScale).connect(output);
  openHatFilter.connect(openHatPan);
  // The ride rings through a bell band before its high-pass.
  const rideBell = new LeanFilter({ type: "peaking", frequency: recipe.ride.bell, Q: 1.4, gain: 5 });
  const rideFilter = new LeanFilter({ type: "highpass", frequency: recipe.ride.highpass, rolloff: -12 });
  const ridePan = new Panner(0.34 * panScale).connect(output);
  rideBell.chain(rideFilter, ridePan);
  const tomFilter = new LeanFilter({ type: "lowpass", frequency: recipe.tom.lowpass, rolloff: -12 });
  const tomPan = new Panner(-0.12 * panScale).connect(output);
  tomFilter.connect(tomPan);
  // Tone.MembraneSynth: exponential attack, pitch falling from f·octaves to f.
  const kick = new OneShotTone({ kind: "basic", type: recipe.kick.oscillator as BasicWave }, {
    pitch: { octaves: membraneOctaves(recipe.kick.octaves), pitchDecay: recipe.kick.pitchDecay },
    envelope: { ...definition.envelope, sustain: 0.01, attackCurve: "exponential" },
  }).connect(output);
  const snareBody = new OneShotTone({ kind: "basic", type: "triangle" }, {
    pitch: { octaves: membraneOctaves(2.6), pitchDecay: 0.022 },
    envelope: { attack: 0.001, decay: recipe.snare.bodyDecay, sustain: 0, release: 0.09, attackCurve: "exponential" },
  }).connect(snareFilter);
  const tom = new OneShotTone({ kind: "basic", type: "triangle" }, {
    pitch: { octaves: membraneOctaves(2.4), pitchDecay: 0.032 },
    envelope: { attack: 0.001, decay: recipe.tom.decay, sustain: 0, release: 0.13, attackCurve: "exponential" },
  }).connect(tomFilter);
  // One shared synthetic noise source feeds independent envelopes. This keeps
  // the six drum identities and overlapping clap/hat transients without
  // running a separate full-band source for every layer.
  const drumNoise = new Noise(recipe.snare.noise).start();
  const snareNoise = new LeanEnvelope({ attack: 0.001, decay: recipe.snare.decay, sustain: 0, release: 0.07 }).connect(snareFilter);
  const clapNoises = Array.from({ length: 3 }, () => new LeanEnvelope({ attack: 0.001, decay: recipe.clap.decay, sustain: 0, release: 0.04 }).connect(clapFilter));
  // After the three hand claps, the room: a longer, softer burst.
  const clapTail = new LeanEnvelope({ attack: 0.002, decay: recipe.clap.decay * 3.2, sustain: 0, release: 0.08 }).connect(clapFilter);
  const closedHat = new LeanEnvelope({ attack: 0.001, decay: recipe.hats.closedDecay, sustain: 0, release: Math.max(0.025, recipe.hats.closedDecay * 0.45) }).connect(closedHatFilter);
  const openHat = new LeanEnvelope({ attack: 0.001, decay: recipe.hats.openDecay, sustain: 0, release: Math.max(0.025, recipe.hats.openDecay * 0.45) }).connect(openHatFilter);
  // Hats: the 808/909 metal of six square waves, with a breath of the kit's noise for the sizzle.
  const metal = new MetalNoise(recipe.hats.frequency).start();
  const ride = new LeanEnvelope({ attack: 0.002, decay: recipe.ride.decay, sustain: 0, release: recipe.ride.decay * 0.5 }).connect(rideBell);
  metal.fan(closedHat, openHat, ride);
  const hatNoise = new Gain(HAT_NOISE_LEVEL);
  hatNoise.fan(closedHat, openHat);
  drumNoise.fan(snareNoise, ...clapNoises, clapTail, hatNoise);
  const triggerHat = (hat: LeanEnvelope, noteLength: number | string, time: number, velocity: number) => {
    hat.triggerAttackRelease(toSeconds(noteLength), time, velocity);
  };
  // The click: a few milliseconds of noise above the body, where small speakers hear the kick.
  const transientFilter = recipe.kick.transient > 0 ? new LeanFilter({ type: "highpass", frequency: 1_100, rolloff: -12 }).connect(output) : null;
  const transient = transientFilter
    ? new LeanEnvelope({ attack: 0.0005, decay: 0.014, sustain: 0, release: 0.01 }).connect(transientFilter)
    : null;
  if (transient) drumNoise.connect(transient);
  const subHighpass = recipe.kick.subTail
    ? new LeanFilter({ type: "highpass", frequency: 30, rolloff: -24 })
    : null;
  const subFilter = recipe.kick.subTail && subHighpass
    ? new LeanFilter({ type: "lowpass", frequency: recipe.kick.subTail.cutoff, rolloff: -24 })
    : null;
  const subSaturator = recipe.kick.subTail && subFilter
    ? new CharacterSaturator("density")
    : null;
  if (subHighpass && subFilter && subSaturator) {
    subHighpass.chain(subFilter, subSaturator, output);
    subSaturator.setAmount(0.19, 0.001);
  }
  const subTail = recipe.kick.subTail && subHighpass
    ? new OneShotTone({ kind: "basic", type: "triangle" }, {
        pitch: { octaves: membraneOctaves(1.6), pitchDecay: 0.018 },
        envelope: { attack: 0.003, decay: recipe.kick.subTail.decay, sustain: 0, release: recipe.kick.subTail.release, attackCurve: "exponential" },
      }).connect(subHighpass)
    : null;
  const nodes: SoundNode[] = [kick, snareBody, tom, drumNoise, snareNoise, ...clapNoises, clapTail, metal, hatNoise, closedHat, openHat, ride, rideBell, rideFilter, ridePan, snareFilter, snarePan, clapFilter, clapPan, closedHatFilter, closedHatPan, openHatFilter, openHatPan, tomFilter, tomPan, output];
  if (transient && transientFilter) nodes.push(transient, transientFilter);
  if (subHighpass && subFilter && subSaturator && subTail) nodes.push(subTail, subHighpass, subFilter, subSaturator);
  const trigger = (voice: DrumVoice, step: Step, time: number, velocity: number, root: number | undefined) => {
    const voiceTime = time + performanceOffsetSeconds("drums", voice);
    if (voice === "kick") {
      const kickHz = kickFrequency(root, hertz(recipe.kick.note));
      kick.triggerAttackRelease(kickHz, seconds(step.length === "long" ? "8n" : "16n"), voiceTime, velocity * recipe.kick.velocity);
      transient?.triggerAttackRelease(0.018, voiceTime, velocity * recipe.kick.transient);
      // The rumble rings on the kick's own note, so it stays in tune with the bass.
      if (subTail && recipe.kick.subTail) subTail.triggerAttackRelease(kickHz, recipe.kick.subTail.decay, voiceTime + 0.018, velocity * recipe.kick.subTail.level);
    } else if (voice === "snare") {
      snareNoise.triggerAttackRelease(recipe.snare.decay, voiceTime, velocity * recipe.snare.noiseLevel);
      snareBody.triggerAttackRelease(hertz(recipe.snare.bodyNote), seconds("32n"), voiceTime, velocity * recipe.snare.bodyLevel);
    } else if (voice === "clap") {
      [0, recipe.clap.spacing, recipe.clap.spacing * 2].forEach((offset, index) => clapNoises[index]!.triggerAttackRelease(recipe.clap.decay, voiceTime + offset, velocity * recipe.clap.level * (1 - index * 0.14)));
      clapTail.triggerAttackRelease(recipe.clap.decay * 3.2, voiceTime + recipe.clap.spacing * 3, velocity * recipe.clap.level * 0.6);
    } else if (voice === "closedHat") triggerHat(closedHat, "32n", voiceTime, velocity * recipe.hats.level);
    else if (voice === "openHat") triggerHat(openHat, "8n", voiceTime, velocity * recipe.hats.level * 0.82);
    else if (voice === "ride") ride.triggerAttackRelease(recipe.ride.decay, voiceTime, velocity * recipe.ride.level);
    else tom.triggerAttackRelease(hertz(recipe.tom.note), seconds("8n"), voiceTime, velocity * recipe.tom.level);
  };
  return {
    trigger: (notes, step, time, velocity) => {
      sleep.wake(time, time + DRUM_TAIL_SECONDS);
      const layerGain = 1 / Math.sqrt(Math.max(1, step.drumVoices.length));
      step.drumVoices.forEach((voice) => {
        try {
          trigger(voice, step, time, velocity * layerGain, notes[0]);
        } catch (error) {
          throw new Error(`${voice}: ${error instanceof Error ? error.message : String(error)}`);
        }
      });
    },
    release: (time) => {
      [kick, snareBody, tom, snareNoise, ...clapNoises, clapTail, transient, subTail].forEach((voice) => voice?.triggerRelease(time));
      closedHat.triggerRelease(time);
      openHat.triggerRelease(time);
      ride.triggerRelease(time);
    },
    dispose: () => { sleep.dispose(); nodes.forEach((node) => node.dispose()); },
  };
}

function createAcidBank(preset: SoundPresetMap["acid"], destination: SoundNode, alwaysAwake: boolean): VoiceBank {
  const definition = presetDefinition("acid", preset);
  const recipe = definition.synthesis;
  const output = new Gain(definition.level);
  const sleep = new SleepyOutput(output, destination, alwaysAwake);
  // The 303 goes into its distortion pedal, as most acid does.
  const drive = new AcidDrive(recipe.drive.tone).connect(output);
  const ampEnvelope = new LeanEnvelope(definition.envelope).connect(drive);
  const voiceDrive = new CharacterSaturator(definition.channel.saturationCurve);
  voiceDrive.connect(ampEnvelope);
  const filter = new LeanFilter({ type: "lowpass", frequency: recipe.filterBase, Q: recipe.filterQ, rolloff: -24 }).connect(voiceDrive);
  const filterEnvelope = new FrequencyEnvelope({
    attack: 0.002,
    decay: recipe.filterDecay,
    sustain: recipe.filterSustain,
    release: definition.envelope.release,
    baseFrequency: recipe.filterBase,
    octaves: recipe.filterOctaves,
    exponent: 2.35,
  });
  filter.modulateFrequency(filterEnvelope);
  const oscillator = new LeanTone(output.context, { kind: "basic", type: recipe.oscillator }, 110).start(currentTime());
  oscillator.output.connect(filter.input);
  let active = false;
  return {
    trigger: (notes, step, time, velocity, macros, context) => {
      sleep.wake(time, time + stepDurationSeconds(step.length, context.tempo) + definition.envelope.release + SLEEP_MARGIN_SECONDS);
      const note = notes[0];
      if (note === undefined) return;
      const accent = step.dynamics === "accent";
      const performance = acidStepParameters(preset, accent, context.legato);
      const effects = safeEffectParameters("acid", preset, macros, accent);
      const frequency = midiFrequency(note);
      oscillator.frequency.cancelAndHoldAtTime(time);
      if (context.legato && active) oscillator.frequency.exponentialRampToValueAtTime(frequency, time + performance.portamento);
      else oscillator.frequency.setValueAtTime(frequency, time);
      voiceDrive.setCurve(definition.channel.saturationCurve, 0.012, time);
      voiceDrive.setAmount(effects.saturation, 0.012, time);
      drive.setDrive(acidDrive(preset, macros.pressure, accent), 0.012, time);
      filter.Q.rampTo(effects.q, 0.018, time);
      // Color is the cutoff knob; the envelope sweeps above it, accents further.
      const cutoff = acidCutoff(preset, macros.color);
      filterEnvelope.baseFrequency = cutoff;
      filterEnvelope.octaves = acidEnvelopeOctaves(preset, cutoff, performance.filterBoost);
      filterEnvelope.decay = recipe.filterDecay * performance.decayMultiplier;
      if (!context.legato || !active) {
        const noteVelocity = clamp01(velocity * performance.velocityMultiplier);
        ampEnvelope.triggerAttack(time, noteVelocity);
        filterEnvelope.triggerAttack(time, accent ? 1 : 0.86);
        active = true;
      }
      if (!context.continuesLegato) {
        const releaseTime = time + stepDurationSeconds(step.length, context.tempo);
        ampEnvelope.triggerRelease(releaseTime);
        filterEnvelope.triggerRelease(releaseTime);
        active = false;
      }
    },
    release: (time) => {
      ampEnvelope.triggerRelease(time);
      filterEnvelope.triggerRelease(time);
      active = false;
    },
    dispose: () => {
      sleep.dispose();
      oscillator.stop(currentTime());
      oscillator.dispose();
      [filterEnvelope, filter, voiceDrive, ampEnvelope, drive, output].forEach((node) => node.dispose());
    },
  };
}

/** Lean Tone.Synth / Tone.FMSynth equivalents; both keep a persistent detune signal. */
type MelodicVoice = (OneShotTone & { readonly detune: DetuneSource }) | FmVoice;

function analogVoice(spec: ToneSpec, envelope: { attack: number; decay: number; sustain: number; release: number }): MelodicVoice {
  return new OneShotTone(spec, { envelope, detune: true }) as MelodicVoice;
}

function createStabBank(preset: SoundPresetMap["stab"], destination: SoundNode, alwaysAwake: boolean): VoiceBank {
  const definition = presetDefinition("stab", preset);
  const recipe = definition.synthesis;
  const output = new Gain(definition.level);
  const sleep = new SleepyOutput(output, destination, alwaysAwake);
  const voiceFilter = new LeanFilter({ type: "lowpass", frequency: definition.voiceFilter.base, Q: definition.voiceFilter.q, rolloff: -24 }).connect(output);
  const filterEnvelope = new FrequencyEnvelope({
    attack: definition.voiceFilter.attack,
    decay: definition.voiceFilter.decay,
    sustain: definition.voiceFilter.sustain,
    release: definition.voiceFilter.release,
    baseFrequency: definition.voiceFilter.base,
    octaves: definition.voiceFilter.octaves,
    exponent: 2.1,
  });
  voiceFilter.modulateFrequency(filterEnvelope);
  const voiceCount = preset === "chord" ? 4 : 3;
  const panPositions = preset === "chord" ? [-0.44, 0.18, -0.12, 0.46] : preset === "flash" ? [-0.32, 0, 0.32] : [-0.29, 0, 0.29];
  const pans = Array.from({ length: voiceCount }, (_, index) => new Panner(panPositions[index]!).connect(voiceFilter));
  const voices: MelodicVoice[] = Array.from({ length: voiceCount }, (_, index) => {
    const voice = recipe.engine === "fm"
      ? new FmVoice({
          carrier: recipe.carrier as BasicWave,
          modulator: recipe.modulator as BasicWave,
          harmonicity: recipe.harmonicity,
          modulationIndex: recipe.modulationIndex,
          envelope: definition.envelope,
          modulationEnvelope: recipe.modulationEnvelope,
        }).connect(pans[index]!)
      : analogVoice({ kind: "fat", type: "sawtooth", count: recipe.unisonCount, spread: recipe.spread }, definition.envelope).connect(pans[index]!);
    if (recipe.engine === "analog") voice.detune.value = (index - (voiceCount - 1) / 2) * recipe.detune;
    return voice;
  });
  return {
    trigger: (notes, step, time, velocity, macros, context) => {
      sleep.wake(time, time + toSeconds(duration(step)) + Math.max(definition.envelope.release, definition.voiceFilter.release) + SLEEP_MARGIN_SECONDS);
      filterEnvelope.baseFrequency = definition.voiceFilter.base * (0.72 + clamp01(macros.color) * 0.58);
      filterEnvelope.octaves = definition.voiceFilter.octaves * (0.82 + clamp01(macros.color) * 0.26);
      filterEnvelope.triggerAttack(time, velocity);
      filterEnvelope.triggerRelease(time + stepDurationSeconds(step.length, context.tempo));
      voices.forEach((voice, index) => {
        const note = notes[index];
        if (note === undefined) return;
        if (recipe.engine === "analog") voice.detune.rampTo((index - (voiceCount - 1) / 2) * recipe.detune * (0.65 + clamp01(macros.motion) * 0.55), 0.035, time);
        voice.triggerAttackRelease(midiFrequency(note), seconds(duration(step)), time, velocity);
      });
    },
    release: (time) => { voices.forEach((voice) => voice.triggerRelease(time)); filterEnvelope.triggerRelease(time); },
    dispose: () => { sleep.dispose(); voices.forEach((voice) => voice.dispose()); pans.forEach((pan) => pan.dispose()); filterEnvelope.dispose(); voiceFilter.dispose(); output.dispose(); },
  };
}

function createRaveBank(preset: SoundPresetMap["rave"], destination: SoundNode, alwaysAwake: boolean): VoiceBank {
  const definition = presetDefinition("rave", preset);
  const recipe = definition.synthesis;
  const output = new Gain(definition.level);
  const sleep = new SleepyOutput(output, destination, alwaysAwake);
  const chorus = new LeanChorus({ frequency: definition.modulation.frequency * 0.34, delayTime: 3.2, depth: 0.42, feedback: 0.04, wet: definition.modulation.chorusWet }).connect(output);
  const vibrato = new LeanVibrato({ frequency: definition.modulation.frequency, depth: definition.modulation.vibratoDepth, maxDelay: 0.004, wet: 0.16 }).connect(chorus);
  const voiceBus = new Gain(1).connect(vibrato);
  const voices: { voice: MelodicVoice; semitones: number; level: number; baseDetune: number; pan: Panner }[] = [];
  const addVoice = (voice: MelodicVoice, semitones: number, level: number, baseDetune: number, panValue: number) => {
    const pan = new Panner(panValue).connect(voiceBus);
    voice.connect(pan);
    voices.push({ voice, semitones, level, baseDetune, pan });
  };
  if (recipe.engine === "fm") {
    addVoice(new FmVoice({
      carrier: recipe.carrier as BasicWave,
      modulator: recipe.modulator as BasicWave,
      harmonicity: recipe.harmonicity,
      modulationIndex: recipe.modulationIndex,
      envelope: definition.envelope,
      modulationEnvelope: recipe.modulationEnvelope,
    }), 0, 1, 0, 0);
  } else if (preset === "hoover") {
    [-19, -7, 7, 19].forEach((detune, index) => addVoice(analogVoice({ kind: "basic", type: "sawtooth" }, definition.envelope), 0, 0.47, detune, [-0.48, -0.16, 0.16, 0.48][index]!));
    addVoice(analogVoice({ kind: "pulse", width: 0.42 }, { ...definition.envelope, sustain: 0.3 }), -12, 0.19, 0, 0);
  } else {
    addVoice(analogVoice({ kind: "pulse", width: recipe.pulseWidth ?? 0.36 }, definition.envelope), 0, 0.9, 0, -0.08);
    addVoice(analogVoice({ kind: "basic", type: "square" }, { ...definition.envelope, sustain: 0.18 }), -12, 0.18, 0, 0.08);
  }
  return {
    trigger: (notes, step, time, velocity, macros, context) => {
      sleep.wake(time, time + toSeconds(duration(step)) + definition.envelope.release + SLEEP_MARGIN_SECONDS);
      const note = notes[0];
      if (note === undefined) return;
      const motion = clamp01(macros.motion);
      vibrato.depth.rampTo(Math.min(0.18, definition.modulation.vibratoDepth + motion * definition.modulation.vibratoMotion), 0.04, time);
      vibrato.wet.rampTo(Math.min(0.3, 0.08 + motion * 0.18), 0.04, time);
      chorus.wet?.rampTo(Math.min(0.36, definition.modulation.chorusWet + motion * definition.modulation.chorusMotion), 0.04, time);
      voices.forEach(({ voice, semitones, level, baseDetune }) => {
        const slowMotion = ((context.bar * 16 + context.step) % 8 < 4 ? -1 : 1) * motion * 4;
        if (preset === "hoover") {
          voice.detune.setValueAtTime(baseDetune + slowMotion + 26, time);
          voice.detune.linearRampToValueAtTime(baseDetune + slowMotion, time + 0.032);
        } else if (preset === "siren") {
          voice.detune.setValueAtTime(-82, time);
          voice.detune.linearRampToValueAtTime(78, time + Math.min(0.34, stepDurationSeconds(step.length, context.tempo) * 0.8));
        }
        voice.triggerAttackRelease(midiFrequency(note + semitones), seconds(duration(step)), time, clamp01(velocity * level));
      });
    },
    release: (time) => voices.forEach(({ voice }) => voice.triggerRelease(time)),
    dispose: () => { sleep.dispose(); voices.forEach(({ voice, pan }) => { voice.dispose(); pan.dispose(); }); voiceBus.dispose(); vibrato.dispose(); chorus.dispose(); output.dispose(); },
  };
}

function createTextureBank(preset: SoundPresetMap["texture"], destination: SoundNode, alwaysAwake: boolean): VoiceBank {
  const definition = presetDefinition("texture", preset);
  const output = new Gain(definition.level);
  const sleep = new SleepyOutput(output, destination, alwaysAwake);
  const recipe = definition.synthesis;
  if (recipe.source === "drone") {
    const highFilter = new LeanFilter({ type: "bandpass", frequency: recipe.filterFrequency, Q: 0.72, rolloff: -24 });
    const widener = new LeanStereoWidener(0.68).connect(output);
    highFilter.connect(widener);
    const lowFilter = new LeanFilter({ type: "lowpass", frequency: 165, Q: 0.4, rolloff: -24 }).connect(output);
    const sawGain = new Gain(recipe.sawLevel).connect(highFilter);
    const sineGain = new Gain(recipe.sineLevel).connect(lowFilter);
    const saw = new OneShotTone({ kind: "fat", type: "sawtooth", count: recipe.unisonCount, spread: recipe.spread }, { envelope: definition.envelope }).connect(sawGain);
    const sine = new OneShotTone({ kind: "basic", type: "sine" }, { envelope: definition.envelope }).connect(sineGain);
    return {
      trigger: (notes, step, time, velocity) => {
        sleep.wake(time, time + toSeconds(step.length === "short" ? "8n" : "2n") + definition.envelope.release + SLEEP_MARGIN_SECONDS);
        const note = notes[0] ?? 36;
        saw.triggerAttackRelease(midiFrequency(note), seconds(step.length === "short" ? "8n" : "2n"), time, velocity * 0.78);
        sine.triggerAttackRelease(midiFrequency(note - 12), seconds(step.length === "short" ? "8n" : "2n"), time, velocity * 0.64);
      },
      release: (time) => { saw.triggerRelease(time); sine.triggerRelease(time); },
      dispose: () => { sleep.dispose(); [saw, sine, sawGain, sineGain, highFilter, lowFilter, widener, output].forEach((node) => node.dispose()); },
    };
  }

  const widener = recipe.source === "riser" ? new LeanStereoWidener(0.18).connect(output) : null;
  const panner = recipe.source === "noise" ? new Panner(-0.16).connect(output) : null;
  const filter = new LeanFilter({ type: "bandpass", frequency: recipe.filterStart, Q: recipe.source === "riser" ? 1.05 : 1.8, rolloff: -24 }).connect(widener ?? panner ?? output);
  const noise = new NoiseVoice(recipe.noise, definition.envelope).connect(filter);
  return {
    trigger: (_notes, step, time, velocity, macros, context) => {
      const motion = clamp01(macros.motion);
      const sweepEnd = recipe.filterStart + (recipe.filterEnd - recipe.filterStart) * (0.58 + motion * 0.42);
      const sweepSeconds = recipe.source === "riser" ? riserDurationSeconds(step.length, context.tempo) : recipe.sweepSeconds;
      filter.frequency.cancelScheduledValues(time);
      filter.frequency.setValueAtTime(recipe.filterStart, time);
      filter.frequency.exponentialRampToValueAtTime(sweepEnd, time + sweepSeconds);
      if (recipe.source === "riser" && widener) {
        filter.Q.setValueAtTime(0.9, time);
        filter.Q.linearRampToValueAtTime(2.35 + motion * 0.85, time + sweepSeconds);
        widener.width.setValueAtTime(0.12, time);
        widener.width.linearRampToValueAtTime(0.74, time + sweepSeconds);
      } else if (panner) {
        const direction = (context.bar * 16 + context.step) % 2 === 0 ? 1 : -1;
        panner.pan.setValueAtTime(-0.2 * direction, time);
        panner.pan.linearRampToValueAtTime(0.2 * direction, time + sweepSeconds);
      }
      const noteLength = recipe.source === "riser" ? sweepSeconds : step.length === "long" ? "2n" : "8n";
      sleep.wake(time, time + toSeconds(noteLength) + definition.envelope.release + SLEEP_MARGIN_SECONDS);
      noise.triggerAttackRelease(seconds(noteLength), time, velocity);
    },
    release: (time) => noise.triggerRelease(time),
    dispose: () => { sleep.dispose(); noise.dispose(); filter.dispose(); widener?.dispose(); panner?.dispose(); output.dispose(); },
  };
}

function hertz(note: number | string): number { return toFrequency(note); }
function seconds(time: number | string): number { return toSeconds(time); }
function nowTime(): number { return now(); }
function dynamicsVelocity(step: Step): number { return step.dynamics === "ghost" ? 0.4 : step.dynamics === "accent" ? 0.94 : 0.68; }
function duration(step: Step): string { return step.length === "short" ? "32n" : step.length === "long" ? "8n" : "16n"; }
function zeroPeaks(): Record<TrackKind, number> { return Object.fromEntries(TRACK_KINDS.map((track) => [track, 0])) as Record<TrackKind, number>; }
function clamp01(value: number): number { return Math.max(0, Math.min(1, value)); }
function trackParameterKey(preset: SoundPresetId, macros: TrackMacros, accent: boolean): string {
  return [preset, macros.color, macros.pressure, macros.space, macros.motion, accent ? 1 : 0].join(":");
}

function createPeakMeter(): PeakMeter {
  const node = soundContext().createAnalyser();
  node.fftSize = 512;
  node.smoothingTimeConstant = 0;
  const samples = new Float32Array(node.fftSize);
  let smoothedDb = -60;
  let heldDb = -60;
  let holdUntil = 0;
  let lastRead = performance.now();
  return {
    node,
    getValue: () => {
      node.getFloatTimeDomainData(samples);
      let sum = 0;
      let peak = 0;
      for (const sample of samples) {
        sum += sample * sample;
        peak = Math.max(peak, Math.abs(sample));
      }
      const rmsDb = Math.max(-60, rmsToDb(Math.sqrt(sum / samples.length)));
      const peakDb = Math.max(-60, rmsToDb(peak));
      const now = performance.now();
      const elapsed = Math.max(0, (now - lastRead) / 1_000);
      const smoothing = rmsDb > smoothedDb ? 0.42 : 0.11;
      smoothedDb += (rmsDb - smoothedDb) * smoothing;
      if (peakDb >= heldDb) {
        heldDb = peakDb;
        holdUntil = now + 520;
      } else if (now > holdUntil) {
        heldDb = Math.max(peakDb, heldDb - elapsed * 22);
      }
      lastRead = now;
      return dbMeterValue(Math.max(smoothedDb, heldDb));
    },
    dispose: () => node.disconnect(),
  };
}

export interface OfflineAudioMetrics {
  finite: boolean;
  dcOffset: number;
  peakDb: number;
  rmsDb: number;
  activeRmsDb: number;
  crestDb: number;
  tailEnergyDb: number;
  nearCeilingRatio: number;
  stereoCorrelation: number;
  lowSideDb: number;
  highSideDb: number;
  sideDb: number;
  bandDb: { low: number; mid: number; high: number };
}

export interface OfflineAudioAcceptanceSuite {
  presets: Record<string, Record<"min" | "mid" | "max", OfflineAudioMetrics>>;
  factories: Record<string, OfflineAudioMetrics>;
  stresses: Record<string, OfflineAudioMetrics>;
}

export async function renderAudioAcceptanceSuite(): Promise<OfflineAudioAcceptanceSuite> {
  const presets: Record<string, Record<"min" | "mid" | "max", OfflineAudioMetrics>> = {};
  for (const track of TRACK_KINDS) {
    for (const preset of SOUND_PRESETS[track]) {
      const name = `${track}:${preset}`;
      try {
        presets[name] = {
          min: await renderOfflinePreset(track, preset, macrosAt(0)),
          mid: await renderOfflinePreset(track, preset, macrosAt(0.5)),
          max: await renderOfflinePreset(track, preset, macrosAt(1)),
        };
      } catch (error) {
        throw new Error(`${name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  const factories: Record<string, OfflineAudioMetrics> = {};
  const stresses: Record<string, OfflineAudioMetrics> = {};
  for (const profile of ["hard", "acid", "hybrid"] as const) {
    for (const tempo of [120, 150, 180] as const) factories[`${profile}:${tempo}`] = await renderOfflineFactory(profile, tempo, false);
    stresses[profile] = await renderOfflineFactory(profile, 150, true);
  }
  return { presets, factories, stresses };
}

function macrosAt(value: number): TrackMacros {
  return { color: value, pressure: value, space: value, motion: value, density: value };
}

export function renderAudioPresetAtLevel(track: TrackKind, preset: SoundPresetId, level = 0.5): Promise<OfflineAudioMetrics> {
  return renderOfflinePreset(track, preset, macrosAt(clamp01(level)));
}

async function renderOfflinePreset(track: TrackKind, preset: SoundPresetId, macros: TrackMacros): Promise<OfflineAudioMetrics> {
  const tempo = 150;
  const buffer = await offline(2.7, async () => {
    setBpm(tempo);
    const master = createMasterGraph(soundContext().destination, 0.9);
    const strip = createTrackGraph(track, preset, macros, 0.88, master.input);
    await strip.ready;
    const bank = createVoiceBank(track, preset, strip.input);
    schedulePresetExample(bank, track, preset, tempo, macros);
  });
  return analyzeOfflineBuffer(buffer);
}

async function renderOfflineFactory(profile: "hard" | "acid" | "hybrid", tempo: 120 | 150 | 180, stress: boolean): Promise<OfflineAudioMetrics> {
  const project = createFactoryProject(profile);
  project.tempo = tempo;
  if (stress) {
    for (const scene of project.scenes) {
      for (const pattern of scene.tracks) Object.assign(pattern.macros, { pressure: 1, space: 1, motion: 1 });
    }
  }
  const beat = 60 / project.tempo;
  const buffer = await offline(beat * 4 + 1.1, async () => {
    setBpm(project.tempo);
    const master = createMasterGraph(soundContext().destination, project.masterVolume);
    const gains = effectiveTrackGains(project);
    const strips = {} as Record<TrackKind, TrackGraph>;
    const banks = {} as Record<TrackKind, VoiceBank>;
    for (const track of TRACK_KINDS) {
      const pattern = project.scenes[3]!.tracks.find((entry) => entry.instrument === track)!;
      const preset = project.soundPresets[track];
      strips[track] = createTrackGraph(track, preset, pattern.macros, gains[track], master.input);
      banks[track] = createVoiceBank(track, preset, strips[track].input);
    }
    await Promise.all(TRACK_KINDS.map((track) => strips[track].ready));
    const scene = project.scenes[3]!;
    for (let stepIndex = 0; stepIndex < 16; stepIndex += 1) {
      const time = 0.08 + stepIndex * beat / 4;
      const drumStep = scene.tracks.find((entry) => entry.instrument === "drums")!.bars[0]!.steps[stepIndex]!;
      if (drumStep.enabled && drumStep.drumVoices.includes("kick") && gains.drums > 0) {
        for (const track of ["acid", "stab", "rave", "texture"] as const) applyOfflineDuck(strips[track].duck, track, project.tempo, time);
      }
      for (const track of TRACK_KINDS) {
        const pattern = scene.tracks.find((entry) => entry.instrument === track)!;
        const step = pattern.bars[0]!.steps[stepIndex]!;
        if (!step.enabled || gains[track] <= 0) continue;
        const preset = project.soundPresets[track];
        const legato = track === "acid" ? acidLegatoContext(pattern.bars, 0, stepIndex) : { legato: false, continues: false };
        const context: TriggerContext = { tempo: project.tempo, scene: 3, bar: 0, step: stepIndex, legato: legato.legato, continuesLegato: legato.continues };
        const velocity = clamp01(dynamicsVelocity(step) * (0.78 + pattern.macros.density * 0.2) * positionalVelocity(0, stepIndex));
        if (track === "drums") {
          banks[track].trigger([], step, time, velocity, pattern.macros, context);
          continue;
        }
        const note = scaleDegreeMidi(project.root, project.scale, step.degree, step.octave);
        const triggerTime = time + performanceOffsetSeconds(track);
        const notes = track === "stab" ? stabVoicing(preset as SoundPresetMap["stab"], scaleChord(project.root, project.scale, step.degree, step.octave)) : [note];
        banks[track].trigger(notes, step, triggerTime, velocity, pattern.macros, context);
      }
    }
  });
  return analyzeOfflineBuffer(buffer);
}

/** Builds in a fresh stereo offline context at 44.1 kHz and renders it, as Tone.Offline did (everything scheduled before the render). */
async function offline(seconds: number, build: () => Promise<void>): Promise<AudioBuffer> {
  const context = new OfflineAudioContext(2, Math.floor(seconds * 44_100), 44_100);
  const previous = useContext(context);
  try {
    await build();
  } finally {
    swapSound(previous);
  }
  return context.startRendering();
}

function createVoiceBank(track: TrackKind, preset: SoundPresetId, destination: SoundNode, alwaysAwake = true): VoiceBank {
  return track === "drums" ? createDrumBank(preset as SoundPresetMap["drums"], destination, alwaysAwake)
    : track === "acid" ? createAcidBank(preset as SoundPresetMap["acid"], destination, alwaysAwake)
      : track === "stab" ? createStabBank(preset as SoundPresetMap["stab"], destination, alwaysAwake)
        : track === "rave" ? createRaveBank(preset as SoundPresetMap["rave"], destination, alwaysAwake)
          : createTextureBank(preset as SoundPresetMap["texture"], destination, alwaysAwake);
}

function schedulePresetExample(bank: VoiceBank, track: TrackKind, preset: SoundPresetId, tempo: number, macros: TrackMacros): void {
  const context = (step: number, legato = false, continuesLegato = false): TriggerContext => ({ tempo, scene: 0, bar: 0, step, legato, continuesLegato });
  const makeStep = (overrides: Partial<Step> = {}): Step => ({ enabled: true, drumVoices: [], degree: 0, octave: 2, dynamics: "normal", length: "normal", slide: false, ...overrides });
  if (track === "drums") {
    const hits: [number, DrumVoice[]][] = [[0.08, ["kick"]], [0.32, ["closedHat"]], [0.56, ["snare", "clap"]], [0.82, ["openHat", "ride"]], [1.08, ["tom"]], [1.36, ["kick", "closedHat"]]];
    hits.forEach(([time, drumVoices], index) => {
      try {
        bank.trigger([], makeStep({ drumVoices, dynamics: index === 0 ? "accent" : "normal" }), time, 0.86 * (0.78 + macros.density * 0.2), macros, context(index));
      } catch (error) {
        throw new Error(`Drum-Hit ${drumVoices.join("+")} @ ${time}: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
    return;
  }
  if (track === "acid") {
    bank.trigger([40], makeStep({ dynamics: "accent" }), 0.08, 0.82 * (0.78 + macros.density * 0.2), macros, context(0, false, true));
    bank.trigger([43], makeStep({ slide: true }), 0.08 + 15 / tempo, 0.76 * (0.78 + macros.density * 0.2), macros, context(1, true, true));
    bank.trigger([47], makeStep({ slide: true, length: "long" }), 0.08 + 30 / tempo, 0.78 * (0.78 + macros.density * 0.2), macros, context(2, true, false));
    return;
  }
  const note = track === "texture" ? 42 : 52;
  const firstStep = makeStep({ length: track === "texture" && preset === "riser" ? "normal" : "long" });
  const firstNotes = track === "stab" ? stabVoicing(preset as SoundPresetMap["stab"], [52, 55, 59]) : [note];
  bank.trigger(firstNotes, firstStep, 0.08 + performanceOffsetSeconds(track), 0.84 * (0.78 + macros.density * 0.2), macros, context(0));
  if (track !== "texture") bank.trigger(firstNotes.map((value) => value + 3), makeStep(), 0.72 + performanceOffsetSeconds(track), 0.72 * (0.78 + macros.density * 0.2), macros, context(4));
}

function applyOfflineDuck(gain: Gain, track: TrackKind, tempo: number, time: number): void {
  const envelope = duckEnvelope(track, tempo);
  gain.gain.cancelAndHoldAtTime(time);
  gain.gain.linearRampToValueAtTime(envelope.gain, time + envelope.attack);
  gain.gain.setValueAtTime(envelope.gain, time + envelope.attack + envelope.hold);
  gain.gain.exponentialRampToValueAtTime(1, time + envelope.end);
}

function analyzeOfflineBuffer(buffer: AudioBuffer): OfflineAudioMetrics {
  const left = buffer.getChannelData(0);
  const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left;
  const lowLeft = onePoleLowpass(left, 180, buffer.sampleRate);
  const lowRight = onePoleLowpass(right, 180, buffer.sampleRate);
  const belowHighLeft = onePoleLowpass(left, 2_500, buffer.sampleRate);
  const belowHighRight = onePoleLowpass(right, 2_500, buffer.sampleRate);
  let finiteSamples = true;
  let sum = 0;
  let peak = 0;
  let dcLeft = 0;
  let dcRight = 0;
  let nearCeiling = 0;
  let lowEnergy = 0;
  let midEnergy = 0;
  let highEnergy = 0;
  let sideEnergy = 0;
  let midTotalEnergy = 0;
  let lowSideEnergy = 0;
  let lowMidEnergy = 0;
  let highSideEnergy = 0;
  let highMidEnergy = 0;
  let leftEnergy = 0;
  let rightEnergy = 0;
  let crossEnergy = 0;
  let tailEnergy = 0;
  const nearCeilingGain = Math.pow(10, -1.15 / 20);
  const tailStart = Math.floor(left.length * 0.75);
  for (let index = 0; index < left.length; index += 1) {
    const l = left[index]!;
    const r = right[index]!;
    finiteSamples &&= Number.isFinite(l) && Number.isFinite(r);
    const absolute = Math.max(Math.abs(l), Math.abs(r));
    peak = Math.max(peak, absolute);
    if (absolute >= nearCeilingGain) nearCeiling += 1;
    sum += l * l + r * r;
    leftEnergy += l * l;
    rightEnergy += r * r;
    crossEnergy += l * r;
    if (index >= tailStart) tailEnergy += (l * l + r * r) * 0.5;
    dcLeft += l;
    dcRight += r;
    const mid = (l + r) * 0.5;
    const side = (l - r) * 0.5;
    sideEnergy += side * side;
    midTotalEnergy += mid * mid;
    const lowMid = (lowLeft[index]! + lowRight[index]!) * 0.5;
    const lowSide = (lowLeft[index]! - lowRight[index]!) * 0.5;
    lowMidEnergy += lowMid * lowMid;
    lowSideEnergy += lowSide * lowSide;
    const highL = l - belowHighLeft[index]!;
    const highR = r - belowHighRight[index]!;
    const highMid = (highL + highR) * 0.5;
    const highSide = (highL - highR) * 0.5;
    highMidEnergy += highMid * highMid;
    highSideEnergy += highSide * highSide;
    lowEnergy += (lowLeft[index]! * lowLeft[index]! + lowRight[index]! * lowRight[index]!) * 0.5;
    highEnergy += (highL * highL + highR * highR) * 0.5;
    const midL = belowHighLeft[index]! - lowLeft[index]!;
    const midR = belowHighRight[index]! - lowRight[index]!;
    midEnergy += (midL * midL + midR * midR) * 0.5;
  }
  const frames = Math.max(1, left.length);
  const rms = Math.sqrt(sum / (frames * 2));
  const peakDb = rmsToDb(peak);
  const rmsDb = rmsToDb(rms);
  return {
    finite: finiteSamples,
    dcOffset: Math.max(Math.abs(dcLeft / frames), Math.abs(dcRight / frames)),
    peakDb,
    rmsDb,
    activeRmsDb: analyzeActiveRms(left, right, buffer.sampleRate),
    crestDb: peakDb - rmsDb,
    tailEnergyDb: energyDb(tailEnergy, frames - tailStart),
    nearCeilingRatio: nearCeiling / frames,
    stereoCorrelation: crossEnergy / Math.sqrt(Math.max(1e-12, leftEnergy * rightEnergy)),
    lowSideDb: energyRatioDb(lowSideEnergy, lowMidEnergy),
    highSideDb: energyRatioDb(highSideEnergy, highMidEnergy),
    sideDb: energyRatioDb(sideEnergy, midTotalEnergy),
    bandDb: { low: energyDb(lowEnergy, frames), mid: energyDb(midEnergy, frames), high: energyDb(highEnergy, frames) },
  };
}

function analyzeActiveRms(left: Float32Array, right: Float32Array, sampleRate: number): number {
  const blockSize = Math.max(1, Math.round(sampleRate * 0.05));
  const blockEnergies: number[] = [];
  for (let start = 0; start < left.length; start += blockSize) {
    const end = Math.min(left.length, start + blockSize);
    let energy = 0;
    for (let index = start; index < end; index += 1) energy += (left[index]! ** 2 + right[index]! ** 2) * 0.5;
    blockEnergies.push(energy / Math.max(1, end - start));
  }
  const peakBlock = Math.max(1e-12, ...blockEnergies);
  const active = blockEnergies.filter((energy) => energy >= peakBlock * 0.01);
  const mean = active.reduce((sum, energy) => sum + energy, 0) / Math.max(1, active.length);
  return rmsToDb(Math.sqrt(mean));
}

function onePoleLowpass(input: Float32Array, cutoff: number, sampleRate: number): Float32Array {
  const output = new Float32Array(input.length);
  const alpha = 1 - Math.exp(-2 * Math.PI * cutoff / sampleRate);
  let value = 0;
  for (let index = 0; index < input.length; index += 1) {
    value += alpha * (input[index]! - value);
    output[index] = value;
  }
  return output;
}

function energyRatioDb(numerator: number, denominator: number): number {
  return 10 * Math.log10(Math.max(1e-12, numerator) / Math.max(1e-12, denominator));
}

function energyDb(energy: number, frames: number): number {
  return 10 * Math.log10(Math.max(1e-12, energy / Math.max(1, frames)));
}

/**
 * Maps a wall-clock time (milliseconds since the epoch) onto this context's
 * clock via its output timestamp, so two tabs on the same audio device sound
 * at the same moment. Times already past start as soon as possible.
 */
export function contextTimeAt(epochMs: number): number {
  const raw = soundContext() as AudioContext;
  const stamp = typeof raw.getOutputTimestamp === "function" ? raw.getOutputTimestamp() : null;
  const target = stamp?.contextTime !== undefined && stamp.performanceTime
    ? stamp.contextTime + (epochMs - (performance.timeOrigin + stamp.performanceTime)) / 1000
    : raw.currentTime + (epochMs - (performance.timeOrigin + performance.now())) / 1000;
  return Math.max(raw.currentTime + 0.03, target);
}

/** Routes each stereo output to its own channel pair of the (offline) destination. */
function connectStems(outputs: readonly SoundNode[]): void {
  const raw = soundContext();
  const merger = raw.createChannelMerger(outputs.length * 2);
  outputs.forEach((output, index) => {
    const splitter = raw.createChannelSplitter(2);
    connect(output, splitter);
    splitter.connect(merger, 0, index * 2);
    splitter.connect(merger, 1, index * 2 + 1);
  });
  merger.connect(raw.destination);
}
