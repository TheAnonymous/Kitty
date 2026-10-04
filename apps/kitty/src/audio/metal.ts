import { SoundNode } from "klangwerk/tone";

/**
 * The metal of 808 and 909 hats: six square waves at inharmonic ratios
 * (205.3, 304.4, 369.6, 522.7, 540 and 800 Hz on the 808), summed. Built once
 * per context and pitch as a one-second buffer of band-limited squares; every
 * partial is rounded to whole hertz, so it completes whole cycles and the loop
 * has no seam. One looping source then feeds every hat.
 */
const METAL_RATIOS = [1, 1.4827, 1.8003, 2.546, 2.6303, 3.8967] as const;
const buffers = new WeakMap<BaseAudioContext, Map<number, AudioBuffer>>();

export function metalBuffer(context: BaseAudioContext, baseHz: number): AudioBuffer {
  const key = Math.round(baseHz);
  let cache = buffers.get(context);
  if (!cache) {
    cache = new Map();
    buffers.set(context, cache);
  }
  const cached = cache.get(key);
  if (cached) return cached;
  const rate = context.sampleRate;
  const buffer = context.createBuffer(1, rate, rate);
  const data = buffer.getChannelData(0);
  const ceiling = rate * 0.45;
  METAL_RATIOS.forEach((ratio, index) => {
    const frequency = Math.round(key * ratio);
    // Fixed phases per partial keep the sum noise-like instead of peaking together.
    const phase = index * 1.7;
    for (let harmonic = 1; harmonic * frequency < ceiling; harmonic += 2) {
      const step = (2 * Math.PI * frequency * harmonic) / rate;
      const amplitude = 4 / (Math.PI * harmonic * METAL_RATIOS.length);
      // A rotating phasor: one multiply-add per sample instead of a sine call.
      const cos = Math.cos(step);
      const sin = Math.sin(step);
      let re = Math.cos(phase * harmonic);
      let im = Math.sin(phase * harmonic);
      for (let i = 0; i < rate; i += 1) {
        data[i]! += amplitude * im;
        const next = re * cos - im * sin;
        im = re * sin + im * cos;
        re = next;
      }
    }
  });
  let peak = 0;
  for (let i = 0; i < rate; i += 1) peak = Math.max(peak, Math.abs(data[i]!));
  const scale = peak > 0 ? 0.9 / peak : 1;
  for (let i = 0; i < rate; i += 1) data[i]! *= scale;
  cache.set(key, buffer);
  return buffer;
}

/** A free-running metal source like Klangwerk's Noise, for hat envelopes to gate. */
export class MetalNoise extends SoundNode {
  readonly name = "MetalNoise";
  readonly input = undefined;
  readonly output: GainNode;
  private source: AudioBufferSourceNode | null = null;

  constructor(private readonly baseHz: number) {
    super();
    this.output = this.context.createGain();
  }

  start(time = this.now()): this {
    const buffer = metalBuffer(this.context, this.baseHz);
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(this.output);
    source.start(time);
    this.source = source;
    return this;
  }

  override dispose(): this {
    try {
      this.source?.stop();
    } catch {
      // already stopped
    }
    this.source?.disconnect();
    return super.dispose();
  }
}
