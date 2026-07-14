import * as Tone from "tone";
import { scaleChord, scaleDegreeMidi } from "../domain/music";
import { acidStepParameters, presetDefinition, safeEffectParameters } from "../domain/sound-presets";
import type { DrumVoice, ProjectV1, SoundPresetId, SoundPresetMap, Step, TrackKind, TrackMacros } from "../domain/types";
import { TRACK_KINDS } from "../domain/types";
import { effectiveTrackGains } from "../store/store";
import { BarQueuedTransport, type SequencerPosition } from "./transport";

export interface AudioStatusEvent { status: "idle" | "starting" | "playing" | "suspended" | "error"; message: string; }
export interface PlayheadEvent extends SequencerPosition { peak: number; trackPeaks: Record<TrackKind, number>; triggeredTracks: TrackKind[]; }

interface TrackStrip {
  filter: Tone.Filter;
  saturator: SoftSaturator;
  compressor: Tone.Compressor;
  delay: Tone.FeedbackDelay;
  reverb: Tone.Reverb;
  gain: Tone.Gain;
  meter: PeakMeter;
}

interface PeakMeter {
  node: AnalyserNode;
  getValue(): number;
  dispose(): void;
}

class SoftSaturator extends Tone.ToneAudioNode {
  readonly name = "SoftSaturator";
  readonly input = new Tone.Gain(1);
  readonly output = new Tone.Gain(1);
  private readonly shaper = new Tone.WaveShaper((value) => Math.tanh(value * 1.35) / Math.tanh(1.35), 4096);

  constructor() {
    super();
    this.shaper.oversample = "2x";
    this.input.chain(this.shaper, this.output);
  }

  setAmount(amount: number, duration: number, time?: number): void {
    this.input.gain.rampTo(1 + amount * 3, duration, time);
    this.output.gain.rampTo(1 / (1 + amount * 0.72), duration, time);
  }

  override dispose(): this {
    super.dispose();
    this.shaper.dispose();
    return this;
  }
}

interface VoiceBank {
  trigger(notes: number[], step: Step, time: number, velocity: number, macros: TrackMacros): void;
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
  private masterMeter: PeakMeter | null = null;
  private readonly banks = new Map<string, VoiceBank>();
  private activePresets: Partial<Record<TrackKind, SoundPresetId>> = {};
  private appliedTempo: number | null = null;
  private appliedSwing: number | null = null;
  private appliedMasterVolume: number | null = null;
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
    this.masterMeter?.dispose();
    this.strips = null;
    this.masterNodes = [];
    this.masterMeter = null;
    this.activePresets = {};
    this.appliedTempo = null;
    this.appliedSwing = null;
    this.appliedMasterVolume = null;
    this.initialized = false;
  }

  private async createGraph(): Promise<void> {
    const highpass = new Tone.Filter({ type: "highpass", frequency: 28, rolloff: -24 });
    const compressor = new Tone.Compressor({ threshold: -18, ratio: 3, attack: 0.012, release: 0.22 });
    const limiter = new Tone.Limiter(-1.2);
    const meter = createPeakMeter();
    highpass.chain(compressor, limiter, meter.node, Tone.getDestination());
    this.masterNodes = [highpass, compressor, limiter];
    this.masterMeter = meter;
    const strips = {} as Record<TrackKind, TrackStrip>;
    for (const track of TRACK_KINDS) {
      const filter = new Tone.Filter({ type: "lowpass", frequency: 7_000, rolloff: track === "acid" ? -24 : -12 });
      const saturator = new SoftSaturator();
      const trackCompressor = new Tone.Compressor({ threshold: -10, ratio: 1.6, attack: 0.004, release: 0.12 });
      const delay = new Tone.FeedbackDelay({ delayTime: "8n", feedback: 0.14, wet: 0.08 });
      const reverb = new Tone.Reverb({ decay: track === "texture" ? 3.2 : 1.5, preDelay: 0.02, wet: 0.1 });
      const gain = new Tone.Gain(0.7);
      const trackMeter = createPeakMeter();
      filter.chain(saturator, trackCompressor, delay, reverb, gain, trackMeter.node, highpass);
      strips[track] = { filter, saturator, compressor: trackCompressor, delay, reverb, gain, meter: trackMeter };
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
    if (this.appliedTempo !== this.project.tempo) {
      transport.bpm.rampTo(this.project.tempo, 0.08);
      this.appliedTempo = this.project.tempo;
    }
    if (this.appliedSwing !== this.project.swing) {
      transport.swing = this.project.swing;
      transport.swingSubdivision = "16n";
      this.appliedSwing = this.project.swing;
    }
    if (this.appliedMasterVolume !== this.project.masterVolume) {
      Tone.getDestination().volume.rampTo(gainToDb(this.project.masterVolume), 0.04);
      this.appliedMasterVolume = this.project.masterVolume;
    }
    const gains = effectiveTrackGains(this.project);
    const playing = this.scheduleId !== null;
    for (const track of TRACK_KINDS) {
      const strip = this.strips?.[track];
      if (!strip) continue;
      strip.gain.gain.rampTo(gains[track], 0.03);
      const macros = this.patternFor(this.clock.runningScene, track)?.macros;
      const preset = this.project.soundPresets[track];
      if (macros && (!playing || this.activePresets[track] === preset)) {
        this.activePresets[track] = preset;
        this.applyMacros(strip, macros, track, preset);
      }
    }
  }

  private applyMacros(strip: TrackStrip, macros: TrackMacros, track: TrackKind, preset: SoundPresetId, accent = false, time?: number): void {
    const parameters = safeEffectParameters(track, preset, macros, accent);
    const duration = time === undefined ? 0.08 : 0.025;
    strip.filter.frequency.rampTo(parameters.cutoff, duration, time);
    strip.filter.Q.rampTo(parameters.q, duration, time);
    strip.saturator.setAmount(parameters.saturation, duration, time);
    strip.compressor.threshold.rampTo(parameters.threshold, duration, time);
    strip.compressor.ratio.rampTo(parameters.ratio, duration, time);
    strip.delay.wet.rampTo(parameters.delayWet, duration, time);
    strip.delay.feedback.rampTo(parameters.feedback, duration, time);
    strip.reverb.wet.rampTo(parameters.reverbWet, duration, time);
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
    const preset = this.project.soundPresets[track];
    const strip = this.strips?.[track];
    if (!strip) return false;
    this.activePresets[track] = preset;
    this.applyMacros(strip, pattern.macros, track, preset, track === "acid" && step.dynamics === "accent", time);
    const velocity = clamp01(dynamicsVelocity(step) * (0.78 + pattern.macros.density * 0.2));
    const bank = this.bankFor(track);
    if (track === "drums") {
      bank.trigger([], step, time, velocity, pattern.macros);
      return true;
    }
    const note = scaleDegreeMidi(this.project.root, this.project.scale, step.degree, step.octave);
    if (track === "stab") {
      bank.trigger(scaleChord(this.project.root, this.project.scale, step.degree, step.octave).slice(0, 3), step, time, velocity, pattern.macros);
      return true;
    }
    bank.trigger([note], step, time, velocity, pattern.macros);
    return true;
  }

  private bankFor(track: TrackKind): VoiceBank {
    const preset = this.project.soundPresets[track];
    const key = `${track}:${preset}`;
    const existing = this.banks.get(key);
    if (existing) return existing;
    const destination = this.strips?.[track].filter;
    if (!destination) throw new Error("Audio-Signalweg ist nicht initialisiert");
    const bank = track === "drums" ? createDrumBank(preset as SoundPresetMap["drums"], destination)
      : track === "acid" ? createAcidBank(preset as SoundPresetMap["acid"], destination)
        : track === "stab" ? createStabBank(preset as SoundPresetMap["stab"], destination)
          : track === "rave" ? createRaveBank(preset as SoundPresetMap["rave"], destination)
            : createTextureBank(preset as SoundPresetMap["texture"], destination);
    this.banks.set(key, bank);
    return bank;
  }

  private patternFor(scene: number, track: TrackKind) { return this.project.scenes[scene]?.tracks.find((entry) => entry.instrument === track); }
  private releaseAll(): void { for (const bank of this.banks.values()) bank.release(); }

  private monitorMeters(): void {
    if (!this.initialized) return;
    const master = this.masterMeter?.getValue() ?? 0;
    this.peak = clamp01(Math.max(master, this.peak * 0.93));
    for (const track of TRACK_KINDS) {
      const value = this.strips?.[track].meter.getValue() ?? 0;
      this.trackPeaks[track] = clamp01(Math.max(value, this.trackPeaks[track] * 0.92));
    }
    this.meterFrame = requestAnimationFrame(() => this.monitorMeters());
  }

  private emitStatus(status: AudioStatusEvent["status"], message: string): void { for (const listener of this.statusListeners) listener({ status, message }); }
}

function createDrumBank(preset: SoundPresetMap["drums"], destination: Tone.ToneAudioNode): VoiceBank {
  const definition = presetDefinition("drums", preset);
  const recipe = definition.synthesis;
  const output = new Tone.Gain(definition.level).connect(destination);
  const kick = new Tone.MembraneSynth({
    pitchDecay: recipe.kick.pitchDecay,
    octaves: recipe.kick.octaves,
    oscillator: { type: recipe.kick.oscillator },
    envelope: { ...definition.envelope, sustain: 0.01 },
  }).connect(output);
  const snareBody = new Tone.MembraneSynth({
    pitchDecay: 0.022,
    octaves: 2.6,
    oscillator: { type: "triangle" },
    envelope: { attack: 0.001, decay: recipe.snare.bodyDecay, sustain: 0, release: 0.09 },
  }).connect(output);
  const tom = new Tone.MembraneSynth({
    pitchDecay: 0.032,
    octaves: 2.4,
    oscillator: { type: "triangle" },
    envelope: { attack: 0.001, decay: recipe.tom.decay, sustain: 0, release: 0.13 },
  }).connect(output);
  const snareNoise = new Tone.NoiseSynth({ noise: { type: recipe.snare.noise }, envelope: { attack: 0.001, decay: recipe.snare.decay, sustain: 0, release: 0.07 } }).connect(output);
  const clapNoise = new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay: recipe.clap.decay, sustain: 0, release: 0.04 } }).connect(output);
  const closedHat = createMetalHat(recipe.hats, recipe.hats.closedDecay, output);
  const openHat = createMetalHat(recipe.hats, recipe.hats.openDecay, output);
  const transient = recipe.kick.transient > 0
    ? new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.0005, decay: 0.018, sustain: 0, release: 0.012 } }).connect(output)
    : null;
  const subFilter = recipe.kick.subTail
    ? new Tone.Filter({ type: "lowpass", frequency: recipe.kick.subTail.cutoff, rolloff: -24 }).connect(output)
    : null;
  const subTail = recipe.kick.subTail && subFilter
    ? new Tone.MembraneSynth({ pitchDecay: 0.018, octaves: 1.6, oscillator: { type: "triangle" }, envelope: { attack: 0.003, decay: recipe.kick.subTail.decay, sustain: 0, release: recipe.kick.subTail.release } }).connect(subFilter)
    : null;
  const nodes: Tone.ToneAudioNode[] = [kick, snareBody, tom, snareNoise, clapNoise, closedHat, openHat, output];
  if (transient) nodes.push(transient);
  if (subFilter && subTail) nodes.push(subTail, subFilter);
  const trigger = (voice: DrumVoice, step: Step, time: number, velocity: number) => {
    if (voice === "kick") {
      kick.triggerAttackRelease(recipe.kick.note, step.length === "long" ? "8n" : "16n", time, velocity * recipe.kick.velocity);
      transient?.triggerAttackRelease(0.018, time, velocity * recipe.kick.transient);
      if (subTail && recipe.kick.subTail) subTail.triggerAttackRelease(recipe.kick.subTail.note, recipe.kick.subTail.decay, time + 0.018, velocity * recipe.kick.subTail.level);
    } else if (voice === "snare") {
      snareNoise.triggerAttackRelease(recipe.snare.decay, time, velocity * recipe.snare.noiseLevel);
      snareBody.triggerAttackRelease(recipe.snare.bodyNote, "32n", time, velocity * recipe.snare.bodyLevel);
    } else if (voice === "clap") {
      [0, recipe.clap.spacing, recipe.clap.spacing * 2].forEach((offset, index) => clapNoise.triggerAttackRelease(recipe.clap.decay, time + offset, velocity * recipe.clap.level * (1 - index * 0.14)));
    } else if (voice === "closedHat") closedHat.triggerAttackRelease("32n", time, velocity * recipe.hats.level);
    else if (voice === "openHat") openHat.triggerAttackRelease("8n", time, velocity * recipe.hats.level * 0.82);
    else tom.triggerAttackRelease(recipe.tom.note, "8n", time, velocity * recipe.tom.level);
  };
  return {
    trigger: (_notes, step, time, velocity) => {
      const layerGain = 1 / Math.sqrt(Math.max(1, step.drumVoices.length));
      step.drumVoices.forEach((voice) => trigger(voice, step, time, velocity * layerGain));
    },
    release: (time) => {
      [kick, snareBody, tom, snareNoise, clapNoise, closedHat, openHat, transient, subTail].forEach((voice) => voice?.triggerRelease(time));
    },
    dispose: () => nodes.forEach((node) => node.dispose()),
  };
}

function createMetalHat(recipe: ReturnType<typeof presetDefinition<"drums">>["synthesis"]["hats"], decay: number, destination: Tone.ToneAudioNode): Tone.MetalSynth {
  const hat = new Tone.MetalSynth({
    harmonicity: recipe.harmonicity,
    modulationIndex: recipe.modulationIndex,
    resonance: recipe.resonance,
    octaves: recipe.octaves,
    envelope: { attack: 0.001, decay, release: Math.max(0.025, decay * 0.45) },
  }).connect(destination);
  hat.frequency.value = recipe.frequency;
  return hat;
}

function createAcidBank(preset: SoundPresetMap["acid"], destination: Tone.ToneAudioNode): VoiceBank {
  const definition = presetDefinition("acid", preset);
  const recipe = definition.synthesis;
  const output = new Tone.Gain(definition.level).connect(destination);
  const voice = new Tone.MonoSynth({
    oscillator: { type: recipe.oscillator },
    filter: { type: "lowpass", Q: recipe.filterQ, rolloff: -24 },
    filterEnvelope: { attack: 0.002, decay: recipe.filterDecay, sustain: recipe.filterSustain, release: definition.envelope.release, baseFrequency: recipe.filterBase, octaves: recipe.filterOctaves },
    envelope: definition.envelope,
  }).connect(output);
  return {
    trigger: (notes, step, time, velocity) => {
      const note = notes[0];
      if (note === undefined) return;
      const performance = acidStepParameters(preset, step.dynamics === "accent", step.slide);
      voice.portamento = performance.portamento;
      voice.triggerAttackRelease(Tone.Frequency(note, "midi").toFrequency(), duration(step), time, clamp01(velocity * performance.velocityMultiplier));
    },
    release: (time) => voice.triggerRelease(time),
    dispose: () => { voice.dispose(); output.dispose(); },
  };
}

type MelodicVoice = Tone.Synth | Tone.FMSynth;

function createStabBank(preset: SoundPresetMap["stab"], destination: Tone.ToneAudioNode): VoiceBank {
  const definition = presetDefinition("stab", preset);
  const recipe = definition.synthesis;
  const output = new Tone.Gain(definition.level).connect(destination);
  const voices: MelodicVoice[] = Array.from({ length: VOICE_LIMITS.stab }, (_, index) => {
    const voice = recipe.engine === "fm"
      ? new Tone.FMSynth({
          oscillator: { type: recipe.carrier },
          modulation: { type: recipe.modulator },
          harmonicity: recipe.harmonicity,
          modulationIndex: recipe.modulationIndex,
          envelope: definition.envelope,
          modulationEnvelope: recipe.modulationEnvelope,
        }).connect(output)
      : new Tone.Synth({
          oscillator: { type: recipe.oscillator, count: recipe.unisonCount, spread: recipe.spread },
          envelope: definition.envelope,
        }).connect(output);
    if (recipe.engine === "analog") voice.detune.value = (index - 1) * recipe.detune;
    return voice;
  });
  return {
    trigger: (notes, step, time, velocity, macros) => voices.forEach((voice, index) => {
      const note = notes[index];
      if (note === undefined) return;
      if (recipe.engine === "analog") voice.detune.rampTo((index - 1) * recipe.detune * (0.65 + clamp01(macros.motion) * 0.55), 0.035, time);
      voice.triggerAttackRelease(Tone.Frequency(note, "midi").toFrequency(), duration(step), time, velocity);
    }),
    release: (time) => voices.forEach((voice) => voice.triggerRelease(time)),
    dispose: () => { voices.forEach((voice) => voice.dispose()); output.dispose(); },
  };
}

function createRaveBank(preset: SoundPresetMap["rave"], destination: Tone.ToneAudioNode): VoiceBank {
  const definition = presetDefinition("rave", preset);
  const recipe = definition.synthesis;
  const output = new Tone.Gain(definition.level).connect(destination);
  const chorus = new Tone.Chorus({ frequency: definition.modulation.frequency * 0.34, delayTime: 3.2, depth: 0.42, feedback: 0.04, wet: definition.modulation.chorusWet }).connect(output).start(Tone.now());
  const vibrato = new Tone.Vibrato({ frequency: definition.modulation.frequency, depth: definition.modulation.vibratoDepth, maxDelay: 0.004, wet: 0.16 }).connect(chorus);
  const voiceBus = new Tone.Gain(1).connect(vibrato);
  const voice: MelodicVoice = recipe.engine === "fm"
    ? new Tone.FMSynth({
        oscillator: { type: recipe.carrier },
        modulation: { type: recipe.modulator },
        harmonicity: recipe.harmonicity,
        modulationIndex: recipe.modulationIndex,
        envelope: definition.envelope,
        modulationEnvelope: recipe.modulationEnvelope,
      }).connect(voiceBus)
    : new Tone.Synth({
        oscillator: recipe.oscillator === "fatsawtooth"
          ? { type: "fatsawtooth", count: recipe.unisonCount, spread: recipe.spread }
          : { type: "pulse", width: recipe.pulseWidth ?? 0.4 },
        envelope: definition.envelope,
      }).connect(voiceBus);
  return {
    trigger: (notes, step, time, velocity, macros) => {
      const note = notes[0];
      if (note === undefined) return;
      const motion = clamp01(macros.motion);
      vibrato.depth.rampTo(Math.min(0.18, definition.modulation.vibratoDepth + motion * definition.modulation.vibratoMotion), 0.04, time);
      vibrato.wet.rampTo(Math.min(0.3, 0.08 + motion * 0.18), 0.04, time);
      chorus.wet.rampTo(Math.min(0.36, definition.modulation.chorusWet + motion * definition.modulation.chorusMotion), 0.04, time);
      voice.triggerAttackRelease(Tone.Frequency(note, "midi").toFrequency(), duration(step), time, velocity);
    },
    release: (time) => voice.triggerRelease(time),
    dispose: () => { voice.dispose(); voiceBus.dispose(); vibrato.dispose(); chorus.dispose(); output.dispose(); },
  };
}

function createTextureBank(preset: SoundPresetMap["texture"], destination: Tone.ToneAudioNode): VoiceBank {
  const definition = presetDefinition("texture", preset);
  const output = new Tone.Gain(definition.level).connect(destination);
  const recipe = definition.synthesis;
  if (recipe.source === "drone") {
    const filter = new Tone.Filter({ type: "lowpass", frequency: recipe.filterFrequency, Q: 0.8, rolloff: -24 }).connect(output);
    const sawGain = new Tone.Gain(recipe.sawLevel).connect(filter);
    const sineGain = new Tone.Gain(recipe.sineLevel).connect(filter);
    const saw = new Tone.Synth({ oscillator: { type: "fatsawtooth", count: recipe.unisonCount, spread: recipe.spread }, envelope: definition.envelope }).connect(sawGain);
    const sine = new Tone.Synth({ oscillator: { type: "sine" }, envelope: definition.envelope }).connect(sineGain);
    return {
      trigger: (notes, step, time, velocity) => {
        const note = notes[0] ?? 36;
        saw.triggerAttackRelease(Tone.Frequency(note, "midi").toFrequency(), step.length === "short" ? "8n" : "2n", time, velocity * 0.78);
        sine.triggerAttackRelease(Tone.Frequency(note - 12, "midi").toFrequency(), step.length === "short" ? "8n" : "2n", time, velocity * 0.64);
      },
      release: (time) => { saw.triggerRelease(time); sine.triggerRelease(time); },
      dispose: () => [saw, sine, sawGain, sineGain, filter, output].forEach((node) => node.dispose()),
    };
  }

  const filter = new Tone.Filter({ type: "bandpass", frequency: recipe.filterStart, Q: recipe.source === "riser" ? 1.3 : 1.8, rolloff: -24 }).connect(output);
  const noise = new Tone.NoiseSynth({ noise: { type: recipe.noise }, envelope: definition.envelope }).connect(filter);
  return {
    trigger: (_notes, step, time, velocity, macros) => {
      const motion = clamp01(macros.motion);
      const sweepEnd = recipe.filterStart + (recipe.filterEnd - recipe.filterStart) * (0.58 + motion * 0.42);
      filter.frequency.cancelScheduledValues(time);
      filter.frequency.setValueAtTime(recipe.filterStart, time);
      filter.frequency.exponentialRampToValueAtTime(sweepEnd, time + recipe.sweepSeconds);
      const noteLength = recipe.source === "riser" ? recipe.sweepSeconds + definition.envelope.release * 0.35 : step.length === "long" ? "2n" : "8n";
      noise.triggerAttackRelease(noteLength, time, velocity);
    },
    release: (time) => noise.triggerRelease(time),
    dispose: () => { noise.dispose(); filter.dispose(); output.dispose(); },
  };
}

function dynamicsVelocity(step: Step): number { return step.dynamics === "ghost" ? 0.4 : step.dynamics === "accent" ? 0.94 : 0.68; }
function duration(step: Step): Tone.Unit.Time { return step.length === "short" ? "32n" : step.length === "long" ? "8n" : "16n"; }
function gainToDb(gain: number): number { return gain <= 0 ? -Infinity : 20 * Math.log10(gain); }
function zeroPeaks(): Record<TrackKind, number> { return Object.fromEntries(TRACK_KINDS.map((track) => [track, 0])) as Record<TrackKind, number>; }
function clamp01(value: number): number { return Math.max(0, Math.min(1, value)); }

function createPeakMeter(): PeakMeter {
  const node = Tone.getContext().createAnalyser();
  node.fftSize = 256;
  node.smoothingTimeConstant = 0.68;
  const samples = new Float32Array(node.fftSize);
  return {
    node,
    getValue: () => {
      node.getFloatTimeDomainData(samples);
      const sum = samples.reduce((total, sample) => total + sample * sample, 0);
      return Math.sqrt(sum / samples.length);
    },
    dispose: () => node.disconnect(),
  };
}
