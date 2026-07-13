import * as Tone from "tone";
import { scaleChord, scaleDegreeMidi } from "../domain/music";
import { presetDefinition, safeEffectParameters } from "../domain/sound-presets";
import type { DrumVoice, ProjectV1, SoundPresetId, Step, TrackKind, TrackMacros } from "../domain/types";
import { TRACK_KINDS } from "../domain/types";
import { effectiveTrackGains } from "../store/store";
import { BarQueuedTransport, type SequencerPosition } from "./transport";

export interface AudioStatusEvent { status: "idle" | "starting" | "playing" | "suspended" | "error"; message: string; }
export interface PlayheadEvent extends SequencerPosition { peak: number; trackPeaks: Record<TrackKind, number>; triggeredTracks: TrackKind[]; }

interface TrackStrip {
  filter: Tone.Filter;
  compressor: Tone.Compressor;
  delay: Tone.FeedbackDelay;
  reverb: Tone.Reverb;
  gain: Tone.Gain;
  meter: Tone.Meter;
}

interface VoiceBank {
  trigger(notes: number[], step: Step, time: number, velocity: number): void;
  release(time?: number): void;
  dispose(): void;
}

export const VOICE_LIMITS: Record<TrackKind, number> = { drums: 6, acid: 1, stab: 3, rave: 1, texture: 1 };

export class ToneAudioEngine {
  private project: ProjectV1;
  private initialized = false;
  private graphReady: Promise<void> | null = null;
  private strips: Record<TrackKind, TrackStrip> | null = null;
  private masterNodes: Tone.ToneAudioNode[] = [];
  private masterMeter: Tone.Meter | null = null;
  private readonly banks = new Map<string, VoiceBank>();
  private scheduleId: number | null = null;
  private meterFrame: number | null = null;
  private peak = 0;
  private trackPeaks = zeroPeaks();
  private readonly clock = new BarQueuedTransport();
  private readonly playheadListeners = new Set<(event: PlayheadEvent) => void>();
  private readonly statusListeners = new Set<(event: AudioStatusEvent) => void>();

  constructor(project: ProjectV1) { this.project = structuredClone(project); }

  async initialize(): Promise<void> {
    this.emitStatus("starting", "Audio wird vorbereitet …");
    await Tone.start();
    if (!this.initialized) {
      this.graphReady ??= this.createGraph().finally(() => { this.graphReady = null; });
      await this.graphReady;
    }
    if (Tone.getContext().state !== "running") {
      this.emitStatus("suspended", "Audio ist pausiert – Start erneut anklicken");
      return;
    }
    this.emitStatus("idle", "Audio bereit");
  }

  async start(scene: number): Promise<void> {
    try {
      await this.initialize();
      if (Tone.getContext().state !== "running") return;
      const transport = Tone.getTransport();
      transport.stop();
      transport.cancel();
      transport.position = 0;
      this.clock.start(scene);
      this.applyProject();
      this.scheduleId = transport.scheduleRepeat((time) => this.tick(time), "16n");
      transport.start("+0.05");
      this.emitStatus("playing", "Wiedergabe läuft");
    } catch (error) {
      this.stop(false);
      this.emitStatus("error", error instanceof Error ? `Audio konnte nicht starten: ${error.message}` : "Audio konnte nicht gestartet werden");
    }
  }

  stop(emit = true): void {
    const transport = Tone.getTransport();
    transport.stop();
    if (this.scheduleId !== null) transport.clear(this.scheduleId);
    this.scheduleId = null;
    this.clock.reset();
    this.releaseAll();
    this.peak = 0;
    this.trackPeaks = zeroPeaks();
    if (emit) this.emitStatus("idle", "Gestoppt");
  }

  queueScene(scene: number): number | null { return this.clock.queue(scene); }

  syncProject(project: ProjectV1): void {
    this.project = structuredClone(project);
    if (this.initialized) this.applyProject();
  }

  onPlayhead(listener: (event: PlayheadEvent) => void): () => void { this.playheadListeners.add(listener); return () => this.playheadListeners.delete(listener); }
  onStatus(listener: (event: AudioStatusEvent) => void): () => void { this.statusListeners.add(listener); return () => this.statusListeners.delete(listener); }

  dispose(): void {
    this.stop(false);
    if (this.meterFrame !== null) cancelAnimationFrame(this.meterFrame);
    for (const bank of this.banks.values()) bank.dispose();
    this.banks.clear();
    Object.values(this.strips ?? {}).forEach((strip) => Object.values(strip).forEach((node) => node.dispose()));
    this.masterNodes.forEach((node) => node.dispose());
    this.strips = null;
    this.masterNodes = [];
    this.masterMeter = null;
    this.initialized = false;
  }

  private async createGraph(): Promise<void> {
    const highpass = new Tone.Filter({ type: "highpass", frequency: 28, rolloff: -24 });
    const compressor = new Tone.Compressor({ threshold: -18, ratio: 3, attack: 0.012, release: 0.22 });
    const limiter = new Tone.Limiter(-1.2);
    const meter = new Tone.Meter({ normalRange: true, smoothing: 0.82 });
    highpass.chain(compressor, limiter, meter, Tone.getDestination());
    this.masterNodes = [highpass, compressor, limiter, meter];
    this.masterMeter = meter;
    const strips = {} as Record<TrackKind, TrackStrip>;
    for (const track of TRACK_KINDS) {
      const filter = new Tone.Filter({ type: "lowpass", frequency: 7_000, rolloff: track === "acid" ? -24 : -12 });
      const trackCompressor = new Tone.Compressor({ threshold: -10, ratio: 1.6, attack: 0.004, release: 0.12 });
      const delay = new Tone.FeedbackDelay({ delayTime: "8n", feedback: 0.14, wet: 0.08 });
      const reverb = new Tone.Reverb({ decay: track === "texture" ? 3.2 : 1.5, preDelay: 0.02, wet: 0.1 });
      const gain = new Tone.Gain(0.7);
      const trackMeter = new Tone.Meter({ normalRange: true, smoothing: 0.8 });
      filter.chain(trackCompressor, delay, reverb, gain, trackMeter, highpass);
      strips[track] = { filter, compressor: trackCompressor, delay, reverb, gain, meter: trackMeter };
    }
    this.strips = strips;
    await Promise.all(Object.values(strips).map((strip) => strip.reverb.ready));
    if (this.strips !== strips) throw new Error("Audio-Vorbereitung wurde abgebrochen");
    this.initialized = true;
    this.monitorMeters();
    this.applyProject();
  }

  private applyProject(): void {
    const transport = Tone.getTransport();
    transport.bpm.rampTo(this.project.tempo, 0.08);
    transport.swing = this.project.swing;
    transport.swingSubdivision = "16n";
    Tone.getDestination().volume.rampTo(gainToDb(this.project.masterVolume), 0.04);
    const gains = effectiveTrackGains(this.project);
    for (const track of TRACK_KINDS) {
      const strip = this.strips?.[track];
      if (!strip) continue;
      strip.gain.gain.rampTo(gains[track], 0.03);
      const macros = this.patternFor(this.clock.runningScene, track)?.macros;
      if (macros) this.applyMacros(strip, macros, track);
    }
  }

  private applyMacros(strip: TrackStrip, macros: TrackMacros, track: TrackKind): void {
    const parameters = safeEffectParameters(track, this.project.soundPresets[track], macros);
    strip.filter.frequency.rampTo(parameters.cutoff, 0.08);
    strip.filter.Q.rampTo(parameters.q, 0.08);
    strip.compressor.threshold.rampTo(parameters.threshold, 0.08);
    strip.compressor.ratio.rampTo(parameters.ratio, 0.08);
    strip.delay.wet.rampTo(parameters.delayWet, 0.08);
    strip.delay.feedback.rampTo(parameters.feedback, 0.08);
    strip.reverb.wet.rampTo(parameters.reverbWet, 0.08);
  }

  private tick(time: number): void {
    if (Tone.getContext().state !== "running") {
      this.stop(false);
      this.emitStatus("suspended", "Audio wurde vom Browser pausiert – Start erneut anklicken");
      return;
    }
    const position = this.clock.next();
    if (position.switched) this.applyProject();
    const triggeredTracks = TRACK_KINDS.filter((track) => this.triggerTrack(track, position, time));
    Tone.getDraw().schedule(() => {
      const event = { ...position, peak: this.peak, trackPeaks: { ...this.trackPeaks }, triggeredTracks };
      for (const listener of this.playheadListeners) listener(event);
    }, time);
  }

  private triggerTrack(track: TrackKind, position: SequencerPosition, time: number): boolean {
    const pattern = this.patternFor(position.scene, track);
    const step = pattern?.bars[position.bar]?.steps[position.step];
    if (!pattern || !step?.enabled || effectiveTrackGains(this.project)[track] <= 0) return false;
    const velocity = dynamicsVelocity(step) * (0.78 + pattern.macros.density * 0.2);
    const bank = this.bankFor(track);
    if (track === "drums") {
      bank.trigger([], step, time, velocity);
      return true;
    }
    const note = scaleDegreeMidi(this.project.root, this.project.scale, step.degree, step.octave);
    if (track === "stab") {
      bank.trigger(scaleChord(this.project.root, this.project.scale, step.degree, step.octave).slice(0, 3), step, time, velocity);
      return true;
    }
    bank.trigger([note], step, time, velocity);
    return true;
  }

  private bankFor(track: TrackKind): VoiceBank {
    const preset = this.project.soundPresets[track];
    const key = `${track}:${preset}`;
    const existing = this.banks.get(key);
    if (existing) return existing;
    const destination = this.strips?.[track].filter;
    if (!destination) throw new Error("Audio-Signalweg ist nicht initialisiert");
    const bank = track === "drums" ? createDrumBank(preset, destination)
      : track === "texture" ? createTextureBank(preset, destination)
        : createMelodicBank(track, preset, destination);
    this.banks.set(key, bank);
    return bank;
  }

  private patternFor(scene: number, track: TrackKind) { return this.project.scenes[scene]?.tracks.find((entry) => entry.instrument === track); }
  private releaseAll(): void { for (const bank of this.banks.values()) bank.release(); }

  private monitorMeters(): void {
    if (!this.initialized) return;
    const master = this.masterMeter?.getValue();
    this.peak = clamp01(Math.max(typeof master === "number" ? master : 0, this.peak * 0.86));
    for (const track of TRACK_KINDS) {
      const value = this.strips?.[track].meter.getValue();
      this.trackPeaks[track] = clamp01(Math.max(typeof value === "number" ? value : 0, this.trackPeaks[track] * 0.84));
    }
    this.meterFrame = requestAnimationFrame(() => this.monitorMeters());
  }

  private emitStatus(status: AudioStatusEvent["status"], message: string): void { for (const listener of this.statusListeners) listener({ status, message }); }
}

function createDrumBank(preset: SoundPresetId, destination: Tone.ToneAudioNode): VoiceBank {
  const definition = presetDefinition("drums", preset);
  const output = new Tone.Gain(definition.level).connect(destination);
  const kick = new Tone.MembraneSynth({
    pitchDecay: 0.045, octaves: definition.brightness > 0.7 ? 7 : 5.5,
    oscillator: { type: definition.oscillator === "triangle" ? "triangle" : "sine" },
    envelope: { attack: 0.001, decay: definition.decay, sustain: 0.01, release: definition.release },
  }).connect(output);
  const body = new Tone.MembraneSynth({ pitchDecay: 0.025, octaves: 2.8, oscillator: { type: "triangle" }, envelope: { attack: 0.001, decay: 0.22, sustain: 0, release: 0.1 } }).connect(output);
  const noise = new Tone.NoiseSynth({ noise: { type: definition.brightness > 0.65 ? "white" : "pink" }, envelope: { attack: 0.001, decay: 0.14, sustain: 0, release: 0.08 } }).connect(output);
  const hat = new Tone.MetalSynth({ harmonicity: 5.1, modulationIndex: 26, resonance: 3_400, octaves: 1.4, envelope: { attack: 0.001, decay: 0.08, release: 0.04 } }).connect(output);
  hat.frequency.value = 230;
  const nodes: Tone.ToneAudioNode[] = [kick, body, noise, hat, output];
  const trigger = (voice: DrumVoice, step: Step, time: number, velocity: number) => {
    if (voice === "kick") kick.triggerAttackRelease("C1", step.length === "long" ? "8n" : "16n", time, velocity * 0.82);
    else if (voice === "snare") { noise.triggerAttackRelease(0.14, time, velocity * 0.7); body.triggerAttackRelease("D3", "32n", time, velocity * 0.34); }
    else if (voice === "clap") [0, 0.012, 0.024].forEach((offset, index) => noise.triggerAttackRelease(0.045, time + offset, velocity * (0.38 - index * 0.06)));
    else if (voice === "closedHat") hat.triggerAttackRelease("32n", time, velocity * 0.44);
    else if (voice === "openHat") hat.triggerAttackRelease("8n", time, velocity * 0.34);
    else body.triggerAttackRelease("G1", "8n", time, velocity * 0.64);
  };
  return {
    trigger: (_notes, step, time, velocity) => {
      const layerGain = 1 / Math.sqrt(Math.max(1, step.drumVoices.length));
      step.drumVoices.forEach((voice) => trigger(voice, step, time, velocity * layerGain));
    },
    release: (time) => { kick.triggerRelease(time); body.triggerRelease(time); noise.triggerRelease(time); hat.triggerRelease(time); },
    dispose: () => nodes.forEach((node) => node.dispose()),
  };
}

function createMelodicBank(track: "acid" | "stab" | "rave", preset: SoundPresetId, destination: Tone.ToneAudioNode): VoiceBank {
  const definition = presetDefinition(track, preset);
  const output = new Tone.Gain(definition.level).connect(destination);
  const voices = Array.from({ length: VOICE_LIMITS[track] }, () => track === "acid"
    ? new Tone.MonoSynth({
        oscillator: { type: definition.oscillator },
        filter: { type: "lowpass", Q: 5.5, rolloff: -24 },
        filterEnvelope: { attack: 0.002, decay: definition.decay, sustain: 0.18, release: definition.release, baseFrequency: 90, octaves: 4.2 },
        envelope: { attack: definition.attack, decay: definition.decay, sustain: definition.sustain, release: definition.release },
      }).connect(output)
    : new Tone.Synth({
        oscillator: definition.oscillator === "fatsawtooth" ? { type: "fatsawtooth", count: 2, spread: 18 } : { type: definition.oscillator },
        envelope: { attack: definition.attack, decay: definition.decay, sustain: definition.sustain, release: definition.release },
      }).connect(output));
  const nodes: Tone.ToneAudioNode[] = [...voices, output];
  return {
    trigger: (notes, step, time, velocity) => voices.forEach((voice, index) => {
      const note = notes[index];
      if (note === undefined) return;
      if (voice instanceof Tone.MonoSynth) voice.portamento = step.slide ? 0.08 : 0.002;
      voice.triggerAttackRelease(Tone.Frequency(note, "midi").toFrequency(), duration(step), time, velocity);
    }),
    release: (time) => voices.forEach((voice) => voice.triggerRelease(time)),
    dispose: () => nodes.forEach((node) => node.dispose()),
  };
}

function createTextureBank(preset: SoundPresetId, destination: Tone.ToneAudioNode): VoiceBank {
  const definition = presetDefinition("texture", preset);
  const output = new Tone.Gain(definition.level).connect(destination);
  const noise = new Tone.NoiseSynth({ noise: { type: definition.brightness > 0.6 ? "white" : "pink" }, envelope: { attack: definition.attack, decay: definition.decay, sustain: definition.sustain, release: definition.release } }).connect(output);
  const synth = new Tone.Synth({ oscillator: definition.oscillator === "fatsawtooth" ? { type: "fatsawtooth", count: 2, spread: 22 } : { type: definition.oscillator }, envelope: { attack: definition.attack, decay: definition.decay, sustain: definition.sustain, release: definition.release } }).connect(output);
  const nodes: Tone.ToneAudioNode[] = [noise, synth, output];
  return {
    trigger: (notes, step, time, velocity) => preset === "noise"
      ? noise.triggerAttackRelease(step.length === "long" ? "2n" : "8n", time, velocity)
      : synth.triggerAttackRelease(Tone.Frequency(notes[0] ?? 36, "midi").toFrequency(), step.length === "short" ? "8n" : "2n", time, velocity),
    release: (time) => { noise.triggerRelease(time); synth.triggerRelease(time); },
    dispose: () => nodes.forEach((node) => node.dispose()),
  };
}

function dynamicsVelocity(step: Step): number { return step.dynamics === "ghost" ? 0.4 : step.dynamics === "accent" ? 0.94 : 0.68; }
function duration(step: Step): Tone.Unit.Time { return step.length === "short" ? "32n" : step.length === "long" ? "8n" : "16n"; }
function gainToDb(gain: number): number { return gain <= 0 ? -Infinity : 20 * Math.log10(gain); }
function zeroPeaks(): Record<TrackKind, number> { return Object.fromEntries(TRACK_KINDS.map((track) => [track, 0])) as Record<TrackKind, number>; }
function clamp01(value: number): number { return Math.max(0, Math.min(1, value)); }
