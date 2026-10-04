import { connect, Gain, LeanFilter, SoundNode } from "klangwerk/tone";
import { CharacterSaturator } from "./graph";

/*
 * The rumble of warehouse techno: the kick sent into a dark hall, everything
 * above the low end filtered away, a little saturation so small speakers hear
 * it, and the whole tail pumped down by every kick, so it swells up between
 * them instead of smearing the next one.
 */

export interface RumbleRecipe {
  /** How much kick goes into the hall at the space macro's middle. */
  level: number;
  /** Seconds until the hall has died away by 60 dB. */
  decay: number;
  /** The low-pass after the hall, in hertz. */
  cutoff: number;
}

/** How far the tail ducks under each kick. */
export const RUMBLE_DUCK_FLOOR = 0.08;
/** The duck lets go after the click and body, then swells back over about a beat. */
const RUMBLE_DUCK_HOLD_SECONDS = 0.03;
const RUMBLE_RECOVERY_BEATS = 0.24;
const RUMBLE_SATURATION = 0.35;

const impulses = new WeakMap<BaseAudioContext, Map<number, AudioBuffer>>();

/**
 * The hall's impulse response: noise smoothed below a few hundred hertz, fading
 * in over 12 ms and out over `decay` seconds. It is scaled to unity gain where
 * kicks live (40 to 120 Hz): its energy sits in so narrow a band that unit
 * energy would mean about 18 dB of gain there. The noise is seeded, so every
 * render of a project sounds (and measures) the same.
 */
export function rumbleImpulse(context: BaseAudioContext, decay: number): AudioBuffer {
  const seconds = Math.round(Math.max(0.3, Math.min(3, decay)) * 100) / 100;
  let cache = impulses.get(context);
  if (!cache) {
    cache = new Map();
    impulses.set(context, cache);
  }
  const cached = cache.get(seconds);
  if (cached) return cached;
  const rate = context.sampleRate;
  const length = Math.round(seconds * rate);
  const buffer = context.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  const smoothing = 1 - Math.exp((-2 * Math.PI * 320) / rate);
  let seed = 0x2f6b_1d37;
  let first = 0;
  let second = 0;
  for (let index = 0; index < length; index += 1) {
    seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
    const white = seed / 2_147_483_648 - 1;
    first += (white - first) * smoothing;
    second += (first - second) * smoothing;
    const time = index / rate;
    data[index] = second * (1 - Math.exp(-time / 0.012)) * Math.exp((-6.9 * time) / seconds);
  }
  const gain = lowBandGain(data, rate);
  const scale = gain > 0 ? 1 / gain : 0;
  for (let index = 0; index < length; index += 1) data[index]! *= scale;
  cache.set(seconds, buffer);
  return buffer;
}

/** The response's RMS magnitude over 16 frequencies from 40 to 120 Hz. */
function lowBandGain(data: Float32Array, rate: number): number {
  const probes = 16;
  let power = 0;
  for (let probe = 0; probe < probes; probe += 1) {
    const step = (2 * Math.PI * (40 + (80 * probe) / (probes - 1))) / rate;
    const cos = Math.cos(step);
    const sin = Math.sin(step);
    let re = 1;
    let im = 0;
    let sumRe = 0;
    let sumIm = 0;
    for (let index = 0; index < data.length; index += 1) {
      sumRe += data[index]! * re;
      sumIm -= data[index]! * im;
      const next = re * cos - im * sin;
      im = re * sin + im * cos;
      re = next;
    }
    power += sumRe * sumRe + sumIm * sumIm;
  }
  return Math.sqrt(power / probes);
}

export class KickRumble extends SoundNode {
  readonly name = "KickRumble";
  readonly input: Gain;
  readonly output: Gain;
  private readonly hall: ConvolverNode;
  private readonly lowpass: LeanFilter;
  private readonly highpass: LeanFilter;
  private readonly saturator: CharacterSaturator;

  constructor(recipe: RumbleRecipe) {
    super();
    this.input = new Gain(recipe.level);
    this.hall = this.context.createConvolver();
    this.hall.normalize = false;
    // The kick is mono, and the low end stays mono.
    this.hall.channelCount = 1;
    this.hall.channelCountMode = "explicit";
    this.hall.buffer = rumbleImpulse(this.context, recipe.decay);
    this.lowpass = new LeanFilter({ type: "lowpass", frequency: recipe.cutoff, Q: 0.7, rolloff: -24 });
    this.highpass = new LeanFilter({ type: "highpass", frequency: 34, rolloff: -12 });
    this.saturator = new CharacterSaturator("density");
    this.saturator.setAmount(RUMBLE_SATURATION, 0.001);
    this.output = new Gain(1);
    connect(this.input, this.hall);
    connect(this.hall, this.lowpass);
    this.lowpass.chain(this.highpass, this.saturator, this.output);
  }

  /** How much kick goes into the hall (the send, not the tail already ringing). */
  setSend(amount: number, time: number): void {
    this.input.gain.setValueAtTime(Math.max(0, amount), time);
  }

  /** Ducks the tail under a kick at `time` and lets it swell back over about a beat. */
  pump(time: number, tempo: number): void {
    const beat = 60 / Math.max(40, Math.min(300, tempo));
    const gain = this.output.gain;
    gain.cancelAndHoldAtTime(time);
    gain.linearRampToValueAtTime(RUMBLE_DUCK_FLOOR, time + 0.006);
    gain.setTargetAtTime(1, time + RUMBLE_DUCK_HOLD_SECONDS, beat * RUMBLE_RECOVERY_BEATS);
  }

  override dispose(): this {
    super.dispose();
    this.input.dispose();
    this.hall.disconnect();
    this.lowpass.dispose();
    this.highpass.dispose();
    this.saturator.dispose();
    return this;
  }
}
