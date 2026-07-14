import * as Tone from "tone";
import { presetDefinition, safeEffectParameters, type SaturationCurve } from "../domain/sound-presets";
import type { SoundPresetId, TrackKind, TrackMacros } from "../domain/types";
import { faderGain } from "./polish";

export const MASTER_GRAPH_RECIPE = {
  highpass: 27,
  eq: { low: -0.55, mid: 0.65, high: -0.35, lowFrequency: 120, highFrequency: 7_200 },
  compressor: { threshold: -15, ratio: 2, attack: 0.018, release: 0.19, knee: 8 },
  saturation: { curve: "density" as const, amount: 0.085 },
  limiterDb: -1,
} as const;

export function saturationSample(curve: SaturationCurve, input: number): number {
  const value = Number.isFinite(input) ? Math.max(-8, Math.min(8, input)) : 0;
  if (curve === "bite") return Math.atan(value * 2.6) / Math.atan(2.6);
  if (curve === "density") {
    const shaped = value / (1 + Math.abs(value) * 0.62);
    return shaped * 1.62;
  }
  return Math.tanh(value * 1.35) / Math.tanh(1.35);
}

export function saturationGainCompensation(curve: SaturationCurve, amount: number): number {
  const safe = Number.isFinite(amount) ? Math.max(0, Math.min(1, amount)) : 0;
  const strength = curve === "bite" ? 1.05 : curve === "body" ? 0.78 : 0.62;
  return 1 / Math.sqrt(1 + safe * strength * 2.1);
}

export class CharacterSaturator extends Tone.ToneAudioNode {
  readonly name = "CharacterSaturator";
  readonly input = new Tone.Gain(1);
  readonly output = new Tone.Gain(1);
  private readonly shaper = new Tone.WaveShaper((value) => saturationSample("body", value), 4096);
  private curve: SaturationCurve = "body";

  constructor(curve: SaturationCurve = "body") {
    super();
    this.shaper.oversample = "2x";
    this.input.chain(this.shaper, this.output);
    this.setCurve(curve);
  }

  setCurve(curve: SaturationCurve, _duration = 0.02, _time?: number): void {
    if (curve === this.curve) return;
    this.curve = curve;
    this.shaper.setMap((value) => saturationSample(curve, value), 4096);
  }

  setAmount(amount: number, duration: number, time?: number): void {
    const safe = Number.isFinite(amount) ? Math.max(0, Math.min(1, amount)) : 0;
    const drive = 1 + safe * (this.curve === "bite" ? 4.2 : this.curve === "body" ? 3.25 : 2.75);
    this.input.gain.rampTo(drive, duration, time);
    this.output.gain.rampTo(saturationGainCompensation(this.curve, safe), duration, time);
  }

  override dispose(): this {
    super.dispose();
    this.shaper.dispose();
    return this;
  }
}

export interface MasterGraph {
  input: Tone.Gain;
  fader: Tone.Gain;
  nodes: Tone.ToneAudioNode[];
}

export function createMasterGraph(destination: AudioNode | Tone.ToneAudioNode, volume: number, meter?: AudioNode): MasterGraph {
  const input = new Tone.Gain(1);
  const highpass = new Tone.Filter({ type: "highpass", frequency: MASTER_GRAPH_RECIPE.highpass, rolloff: -24 });
  const eq = new Tone.EQ3(MASTER_GRAPH_RECIPE.eq);
  const compressor = new Tone.Compressor(MASTER_GRAPH_RECIPE.compressor);
  const clipper = new CharacterSaturator(MASTER_GRAPH_RECIPE.saturation.curve);
  clipper.setAmount(MASTER_GRAPH_RECIPE.saturation.amount, 0.001);
  const limiter = new Tone.Limiter(MASTER_GRAPH_RECIPE.limiterDb);
  const fader = new Tone.Gain(faderGain(volume));
  input.chain(highpass, eq, compressor, clipper, limiter, fader);
  if (meter) fader.chain(meter, destination);
  else fader.connect(destination);
  return { input, fader, nodes: [input, highpass, eq, compressor, clipper, limiter, fader] };
}

export interface TrackGraph {
  baseVolume: number;
  outputTrimGain: number;
  input: Tone.Gain;
  highpass: Tone.Filter;
  eq: Tone.EQ3;
  filter: Tone.Filter;
  saturator: CharacterSaturator;
  compressor: Tone.Compressor;
  dry: Tone.Gain;
  delaySend: Tone.Gain;
  delay: Tone.FeedbackDelay | Tone.PingPongDelay;
  delayHighpass: Tone.Filter;
  delayLowpass: Tone.Filter;
  reverbSend: Tone.Gain;
  reverb: Tone.Reverb;
  reverbHighpass: Tone.Filter;
  reverbLowpass: Tone.Filter;
  sum: Tone.Gain;
  widener: Tone.StereoWidener | null;
  duck: Tone.Gain;
  gain: Tone.Gain;
  ready: Promise<void>;
  nodes: Tone.ToneAudioNode[];
}

const DELAY_TIMES: Record<TrackKind, string> = { drums: "16n", acid: "8n", stab: "8n.", rave: "8n", texture: "4n" };
const REVERBS: Record<TrackKind, { decay: number; preDelay: number }> = {
  drums: { decay: 0.72, preDelay: 0.008 },
  acid: { decay: 1.15, preDelay: 0.014 },
  stab: { decay: 1.65, preDelay: 0.019 },
  rave: { decay: 1.9, preDelay: 0.024 },
  texture: { decay: 3.4, preDelay: 0.032 },
};

export function createTrackGraph(
  track: TrackKind,
  preset: SoundPresetId,
  macros: TrackMacros,
  volume: number,
  destination: AudioNode | Tone.ToneAudioNode,
  meter?: AudioNode,
): TrackGraph {
  const channel = presetDefinition(track, preset).channel;
  const parameters = safeEffectParameters(track, preset, macros);
  const input = new Tone.Gain(dbToGain(channel.inputTrimDb));
  const highpass = new Tone.Filter({ type: "highpass", frequency: channel.highpass, rolloff: -24 });
  const eq = new Tone.EQ3(channel.eq);
  const filter = new Tone.Filter({
    type: "lowpass",
    frequency: track === "acid" ? 13_000 : parameters.cutoff,
    Q: track === "acid" ? 0.5 : parameters.q,
    rolloff: filterRolloff(channel.filterCharacter),
  });
  const saturator = new CharacterSaturator(channel.saturationCurve);
  saturator.setAmount(parameters.saturation, 0.001);
  const compressor = new Tone.Compressor({ threshold: parameters.threshold, ratio: parameters.ratio, ...channel.compressor });
  const dry = new Tone.Gain(1);
  const delaySend = new Tone.Gain(parameters.delayWet);
  const delay = channel.delayReturn.stereo
    ? new Tone.PingPongDelay({ delayTime: DELAY_TIMES[track], feedback: parameters.feedback, wet: 1 })
    : new Tone.FeedbackDelay({ delayTime: DELAY_TIMES[track], feedback: parameters.feedback, wet: 1 });
  const delayHighpass = new Tone.Filter({ type: "highpass", frequency: channel.delayReturn.highpass, rolloff: -24 });
  const delayLowpass = new Tone.Filter({ type: "lowpass", frequency: channel.delayReturn.lowpass, rolloff: -12 });
  const reverbSend = new Tone.Gain(parameters.reverbWet);
  const reverb = new Tone.Reverb({ ...REVERBS[track], wet: 1 });
  const reverbHighpass = new Tone.Filter({ type: "highpass", frequency: channel.reverbReturn.highpass, rolloff: -24 });
  const reverbLowpass = new Tone.Filter({ type: "lowpass", frequency: channel.reverbReturn.lowpass, rolloff: -12 });
  const sum = new Tone.Gain(1);
  const widener = track === "drums" || track === "acid" ? null : new Tone.StereoWidener(channel.stereo.base + normalized(macros.motion) * channel.stereo.motion);
  const duck = new Tone.Gain(1);
  const gain = new Tone.Gain(volume * dbToGain(channel.outputTrimDb));

  input.chain(highpass, eq, filter, saturator, compressor);
  compressor.connect(dry);
  compressor.connect(delaySend);
  compressor.connect(reverbSend);
  dry.connect(sum);
  delaySend.chain(delay, delayHighpass, delayLowpass, sum);
  reverbSend.chain(reverb, reverbHighpass, reverbLowpass, sum);
  if (widener) sum.chain(widener, duck, gain);
  else sum.chain(duck, gain);
  if (meter) gain.chain(meter, destination);
  else gain.connect(destination);

  const nodes: Tone.ToneAudioNode[] = [
    input, highpass, eq, filter, saturator, compressor, dry, delaySend, delay, delayHighpass, delayLowpass,
    reverbSend, reverb, reverbHighpass, reverbLowpass, sum, duck, gain,
  ];
  if (widener) nodes.push(widener);
  const graph = { baseVolume: volume, outputTrimGain: dbToGain(channel.outputTrimDb), input, highpass, eq, filter, saturator, compressor, dry, delaySend, delay, delayHighpass, delayLowpass, reverbSend, reverb, reverbHighpass, reverbLowpass, sum, widener, duck, gain, ready: reverb.ready, nodes };
  applyTrackGraphParameters(graph, track, preset, macros, 0.001);
  return graph;
}

export function applyTrackGraphParameters(
  graph: TrackGraph,
  track: TrackKind,
  preset: SoundPresetId,
  macros: TrackMacros,
  duration: number,
  time?: number,
  accent = false,
): void {
  const channel = presetDefinition(track, preset).channel;
  const parameters = safeEffectParameters(track, preset, macros, accent);
  graph.input.gain.rampTo(dbToGain(channel.inputTrimDb), duration, time);
  graph.highpass.frequency.rampTo(channel.highpass, duration, time);
  graph.eq.lowFrequency.rampTo(channel.eq.lowFrequency, duration, time);
  graph.eq.highFrequency.rampTo(channel.eq.highFrequency, duration, time);
  graph.eq.low.rampTo(channel.eq.low - parameters.eqTilt, duration, time);
  graph.eq.mid.rampTo(channel.eq.mid, duration, time);
  graph.eq.high.rampTo(channel.eq.high + parameters.eqTilt, duration, time);
  graph.filter.rolloff = filterRolloff(channel.filterCharacter);
  graph.filter.frequency.rampTo(track === "acid" ? 13_000 : parameters.cutoff, duration, time);
  graph.filter.Q.rampTo(track === "acid" ? 0.5 : parameters.q, duration, time);
  graph.saturator.setCurve(channel.saturationCurve, duration, time);
  graph.saturator.setAmount(parameters.saturation, duration, time);
  graph.compressor.attack.rampTo(channel.compressor.attack, duration, time);
  graph.compressor.release.rampTo(channel.compressor.release, duration, time);
  graph.compressor.knee.rampTo(channel.compressor.knee, duration, time);
  graph.compressor.threshold.rampTo(parameters.threshold, duration, time);
  graph.compressor.ratio.rampTo(parameters.ratio, duration, time);
  graph.delaySend.gain.rampTo(parameters.delayWet, duration, time);
  graph.delay.feedback.rampTo(parameters.feedback, duration, time);
  graph.delayHighpass.frequency.rampTo(channel.delayReturn.highpass, duration, time);
  graph.delayLowpass.frequency.rampTo(channel.delayReturn.lowpass, duration, time);
  graph.reverbSend.gain.rampTo(parameters.reverbWet, duration, time);
  graph.reverbHighpass.frequency.rampTo(channel.reverbReturn.highpass, duration, time);
  graph.reverbLowpass.frequency.rampTo(channel.reverbReturn.lowpass, duration, time);
  graph.widener?.width.rampTo(Math.min(0.72, channel.stereo.base + normalized(macros.motion) * channel.stereo.motion), duration, time);
  graph.outputTrimGain = dbToGain(channel.outputTrimDb);
  graph.gain.gain.rampTo(graph.baseVolume * graph.outputTrimGain, duration, time);
}

export function setTrackGraphVolume(graph: TrackGraph, volume: number, duration: number, time?: number): void {
  graph.baseVolume = volume;
  graph.gain.gain.rampTo(volume * graph.outputTrimGain, duration, time);
}

function filterRolloff(character: "warm" | "sharp" | "clean"): -12 | -24 | -48 {
  return character === "sharp" ? -24 : character === "clean" ? -12 : -48;
}

function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

function normalized(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}
