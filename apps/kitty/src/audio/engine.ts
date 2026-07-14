import * as Tone from "tone";
import { createFactoryProject } from "../domain/defaults";
import { scaleChord, scaleDegreeMidi } from "../domain/music";
import { acidStepParameters, presetDefinition, safeEffectParameters } from "../domain/sound-presets";
import type { DrumVoice, ProjectV1, SoundPresetId, SoundPresetMap, Step, TrackKind, TrackMacros } from "../domain/types";
import { SOUND_PRESETS, TRACK_KINDS } from "../domain/types";
import { effectiveTrackGains } from "../store/store";
import {
  acidLegatoContext,
  dbMeterValue,
  duckEnvelope,
  faderGain,
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
import { BarQueuedTransport, type SequencerPosition } from "./transport";

export interface AudioStatusEvent { status: "idle" | "starting" | "playing" | "suspended" | "error"; message: string; }
export interface PlayheadEvent extends SequencerPosition { peak: number; trackPeaks: Record<TrackKind, number>; triggeredTracks: TrackKind[]; ducking: boolean; acidLegato: boolean; }

interface TrackStrip extends TrackGraph {
  meter: PeakMeter;
}

interface PeakMeter {
  node: AnalyserNode;
  getValue(): number;
  dispose(): void;
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

export const VOICE_LIMITS: Record<TrackKind, number> = { drums: 6, acid: 1, stab: 4, rave: 5, texture: 2 };

export class ToneAudioEngine {
  private project: ProjectV1;
  private initialized = false;
  private graphReady: Promise<void> | null = null;
  private strips: Record<TrackKind, TrackStrip> | null = null;
  private masterNodes: Tone.ToneAudioNode[] = [];
  private masterFader: Tone.Gain | null = null;
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
    if (this.initialized || this.scheduleId !== null) this.stop(false);
    else this.clock.reset();
    if (this.meterFrame !== null) cancelAnimationFrame(this.meterFrame);
    for (const bank of this.banks.values()) bank.dispose();
    this.banks.clear();
    Object.values(this.strips ?? {}).forEach((strip) => {
      strip.nodes.forEach((node) => node.dispose());
      strip.meter.dispose();
    });
    this.masterNodes.forEach((node) => node.dispose());
    this.masterMeter?.dispose();
    this.strips = null;
    this.masterNodes = [];
    this.masterFader = null;
    this.masterMeter = null;
    this.activePresets = {};
    this.appliedTempo = null;
    this.appliedSwing = null;
    this.appliedMasterVolume = null;
    this.initialized = false;
  }

  private async createGraph(): Promise<void> {
    const meter = createPeakMeter();
    const master = createMasterGraph(Tone.getDestination(), this.project.masterVolume, meter.node);
    this.masterNodes = master.nodes;
    this.masterFader = master.fader;
    this.masterMeter = meter;
    const gains = effectiveTrackGains(this.project);
    const strips = {} as Record<TrackKind, TrackStrip>;
    for (const track of TRACK_KINDS) {
      const macros = this.patternFor(this.clock.runningScene, track)?.macros ?? { color: 0.5, pressure: 0.5, space: 0.5, motion: 0.5, density: 0.5 };
      const trackMeter = createPeakMeter();
      const graph = createTrackGraph(track, this.project.soundPresets[track], macros, gains[track], master.input, trackMeter.node);
      strips[track] = { ...graph, meter: trackMeter };
    }
    this.strips = strips;
    await Promise.all(Object.values(strips).map((strip) => strip.ready));
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
      this.masterFader?.gain.rampTo(faderGain(this.project.masterVolume), 0.04);
      this.appliedMasterVolume = this.project.masterVolume;
    }
    const gains = effectiveTrackGains(this.project);
    const playing = this.scheduleId !== null;
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
    const duration = time === undefined ? 0.08 : 0.025;
    applyTrackGraphParameters(strip, track, preset, macros, duration, time, accent);
  }

  private tick(time: number): void {
    if (Tone.getContext().state !== "running") {
      this.stop(false);
      this.emitStatus("suspended", "Audio wurde vom Browser pausiert – Start erneut anklicken");
      return;
    }
    const position = this.clock.next();
    if (position.switched) this.applyProject();
    const ducking = this.hasAudibleKick(position);
    if (ducking) this.triggerDucking(time);
    const acidLegato = this.hasAcidLegato(position);
    const triggeredTracks = TRACK_KINDS.filter((track) => this.triggerTrack(track, position, time));
    Tone.getDraw().schedule(() => {
      const event = { ...position, peak: this.peak, trackPeaks: { ...this.trackPeaks }, triggeredTracks, ducking, acidLegato };
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
    const velocity = clamp01(dynamicsVelocity(step) * (0.78 + pattern.macros.density * 0.2) * positionalVelocity(position.bar, position.step));
    const bank = this.bankFor(track);
    const legato = track === "acid" ? acidLegatoContext(pattern.bars, position.bar, position.step) : { legato: false, continues: false };
    const context: TriggerContext = {
      tempo: this.project.tempo,
      scene: position.scene,
      bar: position.bar,
      step: position.step,
      legato: legato.legato,
      continuesLegato: legato.continues,
    };
    if (track === "drums") {
      bank.trigger([], step, time, velocity, pattern.macros, context);
      return true;
    }
    const note = scaleDegreeMidi(this.project.root, this.project.scale, step.degree, step.octave);
    const triggerTime = time + performanceOffsetSeconds(track);
    if (track === "stab") {
      const chord = scaleChord(this.project.root, this.project.scale, step.degree, step.octave);
      bank.trigger(stabVoicing(preset as SoundPresetMap["stab"], chord), step, triggerTime, velocity, pattern.macros, context);
      return true;
    }
    bank.trigger([note], step, triggerTime, velocity, pattern.macros, context);
    return true;
  }

  private bankFor(track: TrackKind): VoiceBank {
    const preset = this.project.soundPresets[track];
    const key = `${track}:${preset}`;
    const existing = this.banks.get(key);
    if (existing) return existing;
    const destination = this.strips?.[track].input;
    if (!destination) throw new Error("Audio-Signalweg ist nicht initialisiert");
    const bank = createVoiceBank(track, preset, destination);
    this.banks.set(key, bank);
    return bank;
  }

  private patternFor(scene: number, track: TrackKind) { return this.project.scenes[scene]?.tracks.find((entry) => entry.instrument === track); }
  private releaseAll(): void { for (const bank of this.banks.values()) bank.release(); }

  private hasAudibleKick(position: SequencerPosition): boolean {
    const step = this.patternFor(position.scene, "drums")?.bars[position.bar]?.steps[position.step];
    return Boolean(step?.enabled && step.drumVoices.includes("kick") && effectiveTrackGains(this.project).drums > 0);
  }

  private hasAcidLegato(position: SequencerPosition): boolean {
    const pattern = this.patternFor(position.scene, "acid");
    const step = pattern?.bars[position.bar]?.steps[position.step];
    return Boolean(pattern && step?.enabled && effectiveTrackGains(this.project).acid > 0 && acidLegatoContext(pattern.bars, position.bar, position.step).legato);
  }

  private triggerDucking(time: number): void {
    for (const track of TRACK_KINDS) {
      if (track === "drums") continue;
      const gain = this.strips?.[track].duck.gain;
      if (!gain) continue;
      const envelope = duckEnvelope(track, this.project.tempo);
      gain.cancelAndHoldAtTime(time);
      gain.linearRampToValueAtTime(envelope.gain, time + envelope.attack);
      gain.setValueAtTime(envelope.gain, time + envelope.attack + envelope.hold);
      gain.exponentialRampToValueAtTime(1, time + envelope.end);
    }
  }

  private monitorMeters(): void {
    if (!this.initialized) return;
    const master = this.masterMeter?.getValue() ?? 0;
    this.peak = master;
    for (const track of TRACK_KINDS) {
      const value = this.strips?.[track].meter.getValue() ?? 0;
      this.trackPeaks[track] = value;
    }
    this.meterFrame = requestAnimationFrame(() => this.monitorMeters());
  }

  private emitStatus(status: AudioStatusEvent["status"], message: string): void { for (const listener of this.statusListeners) listener({ status, message }); }
}

function createDrumBank(preset: SoundPresetMap["drums"], destination: Tone.ToneAudioNode): VoiceBank {
  const definition = presetDefinition("drums", preset);
  const recipe = definition.synthesis;
  const output = new Tone.Gain(definition.level).connect(destination);
  const snareFilter = new Tone.Filter({ type: "highpass", frequency: recipe.snare.highpass, rolloff: -12 });
  const panScale = preset === "steel" ? 2.15 : preset === "rumble" ? 0.42 : 1;
  const snarePan = new Tone.Panner(-0.08 * panScale).connect(output);
  snareFilter.connect(snarePan);
  const clapFilter = new Tone.Filter({ type: "highpass", frequency: recipe.clap.highpass, rolloff: -24 });
  const clapPan = new Tone.Panner(0.17 * panScale).connect(output);
  clapFilter.connect(clapPan);
  const closedHatFilter = new Tone.Filter({ type: "highpass", frequency: recipe.hats.closedHighpass, rolloff: -24 });
  const closedHatPan = new Tone.Panner(-0.23 * panScale).connect(output);
  closedHatFilter.connect(closedHatPan);
  const openHatFilter = new Tone.Filter({ type: "highpass", frequency: recipe.hats.openHighpass, rolloff: -24 });
  const openHatPan = new Tone.Panner(0.27 * panScale).connect(output);
  openHatFilter.connect(openHatPan);
  const tomFilter = new Tone.Filter({ type: "lowpass", frequency: recipe.tom.lowpass, rolloff: -12 });
  const tomPan = new Tone.Panner(-0.12 * panScale).connect(output);
  tomFilter.connect(tomPan);
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
  }).connect(snareFilter);
  const tom = new Tone.MembraneSynth({
    pitchDecay: 0.032,
    octaves: 2.4,
    oscillator: { type: "triangle" },
    envelope: { attack: 0.001, decay: recipe.tom.decay, sustain: 0, release: 0.13 },
  }).connect(tomFilter);
  const snareNoise = new Tone.NoiseSynth({ noise: { type: recipe.snare.noise }, envelope: { attack: 0.001, decay: recipe.snare.decay, sustain: 0, release: 0.07 } }).connect(snareFilter);
  const clapNoises = Array.from({ length: 3 }, () => new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay: recipe.clap.decay, sustain: 0, release: 0.04 } }).connect(clapFilter));
  const activeHats = new Set<Tone.MetalSynth>();
  const hatTimers = new Set<ReturnType<typeof setTimeout>>();
  const triggerHat = (decay: number, target: Tone.ToneAudioNode, noteLength: Tone.Unit.Time, time: number, velocity: number) => {
    const hat = createMetalHat(recipe.hats, decay, target);
    activeHats.add(hat);
    hat.triggerAttackRelease(recipe.hats.frequency, noteLength, time, velocity);
    if (Tone.getContext().name !== "OfflineContext") {
      const delayMs = Math.max(0, (time - Tone.now() + decay + Math.max(0.025, decay * 0.45) + 0.1) * 1_000);
      const timer = setTimeout(() => {
        activeHats.delete(hat);
        hat.dispose();
        hatTimers.delete(timer);
      }, delayMs);
      hatTimers.add(timer);
    }
  };
  const transient = recipe.kick.transient > 0
    ? new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.0005, decay: 0.018, sustain: 0, release: 0.012 } }).connect(output)
    : null;
  const subHighpass = recipe.kick.subTail
    ? new Tone.Filter({ type: "highpass", frequency: 40, rolloff: -24 })
    : null;
  const subFilter = recipe.kick.subTail && subHighpass
    ? new Tone.Filter({ type: "lowpass", frequency: recipe.kick.subTail.cutoff, rolloff: -24 })
    : null;
  const subSaturator = recipe.kick.subTail && subFilter
    ? new CharacterSaturator("density")
    : null;
  if (subHighpass && subFilter && subSaturator) {
    subHighpass.chain(subFilter, subSaturator, output);
    subSaturator.setAmount(0.19, 0.001);
  }
  const subTail = recipe.kick.subTail && subHighpass
    ? new Tone.MembraneSynth({ pitchDecay: 0.018, octaves: 1.6, oscillator: { type: "triangle" }, envelope: { attack: 0.003, decay: recipe.kick.subTail.decay, sustain: 0, release: recipe.kick.subTail.release } }).connect(subHighpass)
    : null;
  const nodes: Tone.ToneAudioNode[] = [kick, snareBody, tom, snareNoise, ...clapNoises, snareFilter, snarePan, clapFilter, clapPan, closedHatFilter, closedHatPan, openHatFilter, openHatPan, tomFilter, tomPan, output];
  if (transient) nodes.push(transient);
  if (subHighpass && subFilter && subSaturator && subTail) nodes.push(subTail, subHighpass, subFilter, subSaturator);
  const trigger = (voice: DrumVoice, step: Step, time: number, velocity: number) => {
    const voiceTime = time + performanceOffsetSeconds("drums", voice);
    if (voice === "kick") {
      kick.triggerAttackRelease(recipe.kick.note, step.length === "long" ? "8n" : "16n", voiceTime, velocity * recipe.kick.velocity);
      transient?.triggerAttackRelease(0.018, voiceTime, velocity * recipe.kick.transient);
      if (subTail && recipe.kick.subTail) subTail.triggerAttackRelease(recipe.kick.subTail.note, recipe.kick.subTail.decay, voiceTime + 0.018, velocity * recipe.kick.subTail.level);
    } else if (voice === "snare") {
      snareNoise.triggerAttackRelease(recipe.snare.decay, voiceTime, velocity * recipe.snare.noiseLevel);
      snareBody.triggerAttackRelease(recipe.snare.bodyNote, "32n", voiceTime, velocity * recipe.snare.bodyLevel);
    } else if (voice === "clap") {
      [0, recipe.clap.spacing, recipe.clap.spacing * 2].forEach((offset, index) => clapNoises[index]!.triggerAttackRelease(recipe.clap.decay, voiceTime + offset, velocity * recipe.clap.level * (1 - index * 0.14)));
    } else if (voice === "closedHat") triggerHat(recipe.hats.closedDecay, closedHatFilter, "32n", voiceTime, velocity * recipe.hats.level);
    else if (voice === "openHat") triggerHat(recipe.hats.openDecay, openHatFilter, "8n", voiceTime, velocity * recipe.hats.level * 0.82);
    else tom.triggerAttackRelease(recipe.tom.note, "8n", voiceTime, velocity * recipe.tom.level);
  };
  return {
    trigger: (_notes, step, time, velocity) => {
      const layerGain = 1 / Math.sqrt(Math.max(1, step.drumVoices.length));
      step.drumVoices.forEach((voice) => {
        try {
          trigger(voice, step, time, velocity * layerGain);
        } catch (error) {
          throw new Error(`${voice}: ${error instanceof Error ? error.message : String(error)}`);
        }
      });
    },
    release: (time) => {
      [kick, snareBody, tom, snareNoise, ...clapNoises, transient, subTail].forEach((voice) => voice?.triggerRelease(time));
      activeHats.forEach((hat) => hat.triggerRelease(time));
    },
    dispose: () => {
      hatTimers.forEach((timer) => clearTimeout(timer));
      activeHats.forEach((hat) => hat.dispose());
      nodes.forEach((node) => node.dispose());
    },
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
  const ampEnvelope = new Tone.AmplitudeEnvelope(definition.envelope).connect(output);
  const voiceDrive = new CharacterSaturator(definition.channel.saturationCurve);
  voiceDrive.connect(ampEnvelope);
  const filter = new Tone.Filter({ type: "lowpass", frequency: recipe.filterBase, Q: recipe.filterQ, rolloff: -24 }).connect(voiceDrive);
  const filterEnvelope = new Tone.FrequencyEnvelope({
    attack: 0.002,
    decay: recipe.filterDecay,
    sustain: recipe.filterSustain,
    release: definition.envelope.release,
    baseFrequency: recipe.filterBase,
    octaves: recipe.filterOctaves,
    exponent: 2.35,
  }).connect(filter.frequency);
  const oscillator = new Tone.Oscillator({ frequency: 110, type: recipe.oscillator }).connect(filter).start();
  let active = false;
  return {
    trigger: (notes, step, time, velocity, macros, context) => {
      const note = notes[0];
      if (note === undefined) return;
      const accent = step.dynamics === "accent";
      const performance = acidStepParameters(preset, accent, context.legato);
      const effects = safeEffectParameters("acid", preset, macros, accent);
      const frequency = Tone.Frequency(note, "midi").toFrequency();
      oscillator.frequency.cancelAndHoldAtTime(time);
      if (context.legato && active) oscillator.frequency.exponentialRampToValueAtTime(frequency, time + performance.portamento);
      else oscillator.frequency.setValueAtTime(frequency, time);
      voiceDrive.setCurve(definition.channel.saturationCurve, 0.012, time);
      voiceDrive.setAmount(effects.saturation, 0.012, time);
      filter.Q.rampTo(effects.q, 0.018, time);
      filterEnvelope.baseFrequency = Math.max(recipe.filterBase * 0.7, Math.min(recipe.filterBase * 2.15, effects.cutoff * 0.12));
      filterEnvelope.octaves = recipe.filterOctaves * performance.filterBoost;
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
    dispose: () => [oscillator, filterEnvelope, filter, voiceDrive, ampEnvelope, output].forEach((node) => node.dispose()),
  };
}

type MelodicVoice = Tone.Synth | Tone.FMSynth;

function createStabBank(preset: SoundPresetMap["stab"], destination: Tone.ToneAudioNode): VoiceBank {
  const definition = presetDefinition("stab", preset);
  const recipe = definition.synthesis;
  const output = new Tone.Gain(definition.level).connect(destination);
  const voiceFilter = new Tone.Filter({ type: "lowpass", frequency: definition.voiceFilter.base, Q: definition.voiceFilter.q, rolloff: -24 }).connect(output);
  const filterEnvelope = new Tone.FrequencyEnvelope({
    attack: definition.voiceFilter.attack,
    decay: definition.voiceFilter.decay,
    sustain: definition.voiceFilter.sustain,
    release: definition.voiceFilter.release,
    baseFrequency: definition.voiceFilter.base,
    octaves: definition.voiceFilter.octaves,
    exponent: 2.1,
  }).connect(voiceFilter.frequency);
  const voiceCount = preset === "chord" ? 4 : 3;
  const panPositions = preset === "chord" ? [-0.44, 0.18, -0.12, 0.46] : preset === "flash" ? [-0.32, 0, 0.32] : [-0.29, 0, 0.29];
  const pans = Array.from({ length: voiceCount }, (_, index) => new Tone.Panner(panPositions[index]!).connect(voiceFilter));
  const voices: MelodicVoice[] = Array.from({ length: voiceCount }, (_, index) => {
    const voice = recipe.engine === "fm"
      ? new Tone.FMSynth({
          oscillator: { type: recipe.carrier },
          modulation: { type: recipe.modulator },
          harmonicity: recipe.harmonicity,
          modulationIndex: recipe.modulationIndex,
          envelope: definition.envelope,
          modulationEnvelope: recipe.modulationEnvelope,
        }).connect(pans[index]!)
      : new Tone.Synth({
          oscillator: { type: recipe.oscillator, count: recipe.unisonCount, spread: recipe.spread },
          envelope: definition.envelope,
        }).connect(pans[index]!);
    if (recipe.engine === "analog") voice.detune.value = (index - (voiceCount - 1) / 2) * recipe.detune;
    return voice;
  });
  return {
    trigger: (notes, step, time, velocity, macros, context) => {
      filterEnvelope.baseFrequency = definition.voiceFilter.base * (0.72 + clamp01(macros.color) * 0.58);
      filterEnvelope.octaves = definition.voiceFilter.octaves * (0.82 + clamp01(macros.color) * 0.26);
      filterEnvelope.triggerAttack(time, velocity);
      filterEnvelope.triggerRelease(time + stepDurationSeconds(step.length, context.tempo));
      voices.forEach((voice, index) => {
        const note = notes[index];
        if (note === undefined) return;
        if (recipe.engine === "analog") voice.detune.rampTo((index - (voiceCount - 1) / 2) * recipe.detune * (0.65 + clamp01(macros.motion) * 0.55), 0.035, time);
        voice.triggerAttackRelease(Tone.Frequency(note, "midi").toFrequency(), duration(step), time, velocity);
      });
    },
    release: (time) => { voices.forEach((voice) => voice.triggerRelease(time)); filterEnvelope.triggerRelease(time); },
    dispose: () => { voices.forEach((voice) => voice.dispose()); pans.forEach((pan) => pan.dispose()); filterEnvelope.dispose(); voiceFilter.dispose(); output.dispose(); },
  };
}

function createRaveBank(preset: SoundPresetMap["rave"], destination: Tone.ToneAudioNode): VoiceBank {
  const definition = presetDefinition("rave", preset);
  const recipe = definition.synthesis;
  const output = new Tone.Gain(definition.level).connect(destination);
  const chorus = new Tone.Chorus({ frequency: definition.modulation.frequency * 0.34, delayTime: 3.2, depth: 0.42, feedback: 0.04, wet: definition.modulation.chorusWet }).connect(output).start(Tone.now());
  const vibrato = new Tone.Vibrato({ frequency: definition.modulation.frequency, depth: definition.modulation.vibratoDepth, maxDelay: 0.004, wet: 0.16 }).connect(chorus);
  const voiceBus = new Tone.Gain(1).connect(vibrato);
  const voices: { voice: MelodicVoice; semitones: number; level: number; baseDetune: number; pan: Tone.Panner }[] = [];
  const addVoice = (voice: MelodicVoice, semitones: number, level: number, baseDetune: number, panValue: number) => {
    const pan = new Tone.Panner(panValue).connect(voiceBus);
    voice.connect(pan);
    voices.push({ voice, semitones, level, baseDetune, pan });
  };
  if (recipe.engine === "fm") {
    addVoice(new Tone.FMSynth({
      oscillator: { type: recipe.carrier },
      modulation: { type: recipe.modulator },
      harmonicity: recipe.harmonicity,
      modulationIndex: recipe.modulationIndex,
      envelope: definition.envelope,
      modulationEnvelope: recipe.modulationEnvelope,
    }), 0, 1, 0, 0);
  } else if (preset === "hoover") {
    [-19, -7, 7, 19].forEach((detune, index) => addVoice(new Tone.Synth({ oscillator: { type: "sawtooth" }, envelope: definition.envelope }), 0, 0.47, detune, [-0.48, -0.16, 0.16, 0.48][index]!));
    addVoice(new Tone.Synth({ oscillator: { type: "pulse", width: 0.42 }, envelope: { ...definition.envelope, sustain: 0.3 } }), -12, 0.19, 0, 0);
  } else {
    addVoice(new Tone.Synth({ oscillator: { type: "pulse", width: recipe.pulseWidth ?? 0.36 }, envelope: definition.envelope }), 0, 0.9, 0, -0.08);
    addVoice(new Tone.Synth({ oscillator: { type: "square" }, envelope: { ...definition.envelope, sustain: 0.18 } }), -12, 0.18, 0, 0.08);
  }
  return {
    trigger: (notes, step, time, velocity, macros, context) => {
      const note = notes[0];
      if (note === undefined) return;
      const motion = clamp01(macros.motion);
      vibrato.depth.rampTo(Math.min(0.18, definition.modulation.vibratoDepth + motion * definition.modulation.vibratoMotion), 0.04, time);
      vibrato.wet.rampTo(Math.min(0.3, 0.08 + motion * 0.18), 0.04, time);
      chorus.wet.rampTo(Math.min(0.36, definition.modulation.chorusWet + motion * definition.modulation.chorusMotion), 0.04, time);
      voices.forEach(({ voice, semitones, level, baseDetune }) => {
        const slowMotion = ((context.bar * 16 + context.step) % 8 < 4 ? -1 : 1) * motion * 4;
        if (preset === "hoover") {
          voice.detune.setValueAtTime(baseDetune + slowMotion + 26, time);
          voice.detune.linearRampToValueAtTime(baseDetune + slowMotion, time + 0.032);
        } else if (preset === "siren") {
          voice.detune.setValueAtTime(-82, time);
          voice.detune.linearRampToValueAtTime(78, time + Math.min(0.34, stepDurationSeconds(step.length, context.tempo) * 0.8));
        }
        voice.triggerAttackRelease(Tone.Frequency(note + semitones, "midi").toFrequency(), duration(step), time, clamp01(velocity * level));
      });
    },
    release: (time) => voices.forEach(({ voice }) => voice.triggerRelease(time)),
    dispose: () => { voices.forEach(({ voice, pan }) => { voice.dispose(); pan.dispose(); }); voiceBus.dispose(); vibrato.dispose(); chorus.dispose(); output.dispose(); },
  };
}

function createTextureBank(preset: SoundPresetMap["texture"], destination: Tone.ToneAudioNode): VoiceBank {
  const definition = presetDefinition("texture", preset);
  const output = new Tone.Gain(definition.level).connect(destination);
  const recipe = definition.synthesis;
  if (recipe.source === "drone") {
    const highFilter = new Tone.Filter({ type: "bandpass", frequency: recipe.filterFrequency, Q: 0.72, rolloff: -24 });
    const widener = new Tone.StereoWidener(0.68).connect(output);
    highFilter.connect(widener);
    const lowFilter = new Tone.Filter({ type: "lowpass", frequency: 165, Q: 0.4, rolloff: -24 }).connect(output);
    const sawGain = new Tone.Gain(recipe.sawLevel).connect(highFilter);
    const sineGain = new Tone.Gain(recipe.sineLevel).connect(lowFilter);
    const saw = new Tone.Synth({ oscillator: { type: "fatsawtooth", count: recipe.unisonCount, spread: recipe.spread }, envelope: definition.envelope }).connect(sawGain);
    const sine = new Tone.Synth({ oscillator: { type: "sine" }, envelope: definition.envelope }).connect(sineGain);
    return {
      trigger: (notes, step, time, velocity) => {
        const note = notes[0] ?? 36;
        saw.triggerAttackRelease(Tone.Frequency(note, "midi").toFrequency(), step.length === "short" ? "8n" : "2n", time, velocity * 0.78);
        sine.triggerAttackRelease(Tone.Frequency(note - 12, "midi").toFrequency(), step.length === "short" ? "8n" : "2n", time, velocity * 0.64);
      },
      release: (time) => { saw.triggerRelease(time); sine.triggerRelease(time); },
      dispose: () => [saw, sine, sawGain, sineGain, highFilter, lowFilter, widener, output].forEach((node) => node.dispose()),
    };
  }

  const widener = recipe.source === "riser" ? new Tone.StereoWidener(0.18).connect(output) : null;
  const panner = recipe.source === "noise" ? new Tone.Panner(-0.16).connect(output) : null;
  const filter = new Tone.Filter({ type: "bandpass", frequency: recipe.filterStart, Q: recipe.source === "riser" ? 1.05 : 1.8, rolloff: -24 }).connect(widener ?? panner ?? output);
  const noise = new Tone.NoiseSynth({ noise: { type: recipe.noise }, envelope: definition.envelope }).connect(filter);
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
      noise.triggerAttackRelease(noteLength, time, velocity);
    },
    release: (time) => noise.triggerRelease(time),
    dispose: () => { noise.dispose(); filter.dispose(); widener?.dispose(); panner?.dispose(); output.dispose(); },
  };
}

function dynamicsVelocity(step: Step): number { return step.dynamics === "ghost" ? 0.4 : step.dynamics === "accent" ? 0.94 : 0.68; }
function duration(step: Step): Tone.Unit.Time { return step.length === "short" ? "32n" : step.length === "long" ? "8n" : "16n"; }
function zeroPeaks(): Record<TrackKind, number> { return Object.fromEntries(TRACK_KINDS.map((track) => [track, 0])) as Record<TrackKind, number>; }
function clamp01(value: number): number { return Math.max(0, Math.min(1, value)); }

function createPeakMeter(): PeakMeter {
  const node = Tone.getContext().createAnalyser();
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
      const sum = samples.reduce((total, sample) => total + sample * sample, 0);
      const peak = samples.reduce((maximum, sample) => Math.max(maximum, Math.abs(sample)), 0);
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
  const buffer = await Tone.Offline(async () => {
    Tone.getTransport().bpm.value = tempo;
    const master = createMasterGraph(Tone.getDestination(), 0.9);
    const strip = createTrackGraph(track, preset, macros, 0.88, master.input);
    await strip.ready;
    const bank = createVoiceBank(track, preset, strip.input);
    schedulePresetExample(bank, track, preset, tempo, macros);
  }, 2.7, 2, 44_100);
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
  const buffer = await Tone.Offline(async () => {
    Tone.getTransport().bpm.value = project.tempo;
    const master = createMasterGraph(Tone.getDestination(), project.masterVolume);
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
  }, beat * 4 + 1.1, 2, 44_100);
  return analyzeOfflineBuffer(buffer);
}

function createVoiceBank(track: TrackKind, preset: SoundPresetId, destination: Tone.ToneAudioNode): VoiceBank {
  return track === "drums" ? createDrumBank(preset as SoundPresetMap["drums"], destination)
    : track === "acid" ? createAcidBank(preset as SoundPresetMap["acid"], destination)
      : track === "stab" ? createStabBank(preset as SoundPresetMap["stab"], destination)
        : track === "rave" ? createRaveBank(preset as SoundPresetMap["rave"], destination)
          : createTextureBank(preset as SoundPresetMap["texture"], destination);
}

function schedulePresetExample(bank: VoiceBank, track: TrackKind, preset: SoundPresetId, tempo: number, macros: TrackMacros): void {
  const context = (step: number, legato = false, continuesLegato = false): TriggerContext => ({ tempo, scene: 0, bar: 0, step, legato, continuesLegato });
  const makeStep = (overrides: Partial<Step> = {}): Step => ({ enabled: true, drumVoices: [], degree: 0, octave: 2, dynamics: "normal", length: "normal", slide: false, ...overrides });
  if (track === "drums") {
    const hits: [number, DrumVoice[]][] = [[0.08, ["kick"]], [0.32, ["closedHat"]], [0.56, ["snare", "clap"]], [0.82, ["openHat"]], [1.08, ["tom"]], [1.36, ["kick", "closedHat"]]];
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

function applyOfflineDuck(gain: Tone.Gain, track: TrackKind, tempo: number, time: number): void {
  const envelope = duckEnvelope(track, tempo);
  gain.gain.cancelAndHoldAtTime(time);
  gain.gain.linearRampToValueAtTime(envelope.gain, time + envelope.attack);
  gain.gain.setValueAtTime(envelope.gain, time + envelope.attack + envelope.hold);
  gain.gain.exponentialRampToValueAtTime(1, time + envelope.end);
}

function analyzeOfflineBuffer(buffer: Tone.ToneAudioBuffer): OfflineAudioMetrics {
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
