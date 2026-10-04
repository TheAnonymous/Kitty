import { connect, param, SoundNode } from "klangwerk/tone";

type Param = ReturnType<typeof param>;

/*
 * The 303's filter: a four-pole diode ladder. Unlike the transistor ladder
 * (and the biquads Kitty used before), its stages load each other, so the
 * slope starts gently and grows steep, and the feedback that makes the
 * resonance scoops out the band below the cutoff: the line gets thinner and
 * squelchier as the resonance rises, while a high-pass in the feedback path
 * keeps the bass. The input pair saturates, which is what keeps a screaming
 * resonance in check.
 *
 * The kernel is plain JavaScript in a string: an AudioWorklet runs it from a
 * Blob (the page's CSP allows `script-src blob:`), the tests through
 * `new Function`. The linear core is solved without delay (trapezoidal, as
 * one 4×4 tridiagonal system per sample) at twice the sample rate, so it stays
 * stable and in tune up to the top of the range.
 */

/** Feedback at which the linear ladder rings on its own (phase −180° at 1.42 × the cutoff). */
export const LADDER_SELF_OSCILLATION = 17.2;
/** The most feedback Kitty gives it: just short of ringing, as a 303 at full resonance. */
const MAX_FEEDBACK = 16.4;
/** Below this, the feedback is filtered out: the sub stays, while the line's own root thins out with the band above it. */
export const LADDER_FEEDBACK_HIGHPASS_HZ = 70;
/** How hard the line drives the input pair (1 is a saw at full scale into tanh); with less, the pair rounds off the resonance instead of choking it. */
const INPUT_DRIVE = 0.5;
/** Output make-up per unit of feedback, for the band the resonance scoops out. */
const FEEDBACK_MAKEUP = 0.32;
/** Kitty's acid resonance (the q of the former biquads) at which the ladder is fully up. */
const FULL_RESONANCE_Q = 9;
/**
 * The ladder's resonance peaks 1.1 (a little feedback) to 1.4 (full) times
 * above its cutoff; scaled so, the peak lands near the frequency Kitty asks
 * for, where the biquads had theirs.
 */
const PEAK_CALIBRATION = 0.8;

export const LADDER_KERNEL_SOURCE = String.raw`
class DiodeLadderKernel {
  constructor(sampleRate) {
    this.rate = sampleRate * 2;
    this.limit = sampleRate * 0.45;
    const gh = Math.tan(Math.PI * ${LADDER_FEEDBACK_HIGHPASS_HZ} / this.rate);
    this.hp = gh / (1 + gh);
    this.reset();
  }

  reset() {
    this.s1 = 0;
    this.s2 = 0;
    this.s3 = 0;
    this.s4 = 0;
    this.sh = 0;
    this.last = 0;
    this.cutoff = -1;
  }

  coefficients(cutoff) {
    const g = Math.tan((Math.PI * cutoff) / this.rate);
    const d = 1 + 2 * g;
    const m2 = d - (2 * g * g) / d;
    const m3 = d - (g * g) / m2;
    const m4 = d - (g * g) / m3;
    this.g = g;
    this.d = d;
    this.m2 = m2;
    this.m3 = m3;
    this.m4 = m4;
    // How each stage answers the input alone: (I + gA) p = [2g, 0, 0, 0].
    const r1 = (2 * g) / d;
    const r2 = (g * r1) / m2;
    const r3 = (g * r2) / m3;
    this.p4 = (g * r3) / m4;
    this.p3 = r3 + (g / m3) * this.p4;
    this.p2 = r2 + (g / m2) * this.p3;
    this.p1 = r1 + ((2 * g) / d) * this.p2;
    this.cutoff = cutoff;
  }

  step(x, k) {
    const g = this.g;
    // How each stage answers its stored state alone: (I + gA) q = s.
    const r1 = this.s1 / this.d;
    const r2 = (this.s2 + g * r1) / this.m2;
    const r3 = (this.s3 + g * r2) / this.m3;
    const q4 = (this.s4 + g * r3) / this.m4;
    const q3 = r3 + (g / this.m3) * q4;
    const q2 = r2 + (g / this.m2) * q3;
    const q1 = r1 + ((2 * g) / this.d) * q2;
    // The feedback through its high-pass, solved for the input without delay, then the input pair saturates.
    const a = 1 - this.hp;
    const linear = (x - k * a * (q4 - this.sh)) / (1 + k * a * this.p4);
    const u = Math.tanh(linear * ${INPUT_DRIVE}) / ${INPUT_DRIVE};
    const y1 = this.p1 * u + q1;
    const y2 = this.p2 * u + q2;
    const y3 = this.p3 * u + q3;
    const y4 = this.p4 * u + q4;
    this.s1 = 2 * y1 - this.s1;
    this.s2 = 2 * y2 - this.s2;
    this.s3 = 2 * y3 - this.s3;
    this.s4 = 2 * y4 - this.s4;
    const v = (y4 - this.sh) * this.hp;
    this.sh = this.sh + 2 * v;
    return y4;
  }

  /** One output sample: the cutoff Kitty asks for in hertz, k the feedback (0 to just below ${LADDER_SELF_OSCILLATION}). */
  process(input, frequency, k) {
    const cutoff = frequency * ${PEAK_CALIBRATION};
    const safe = cutoff > 20 ? (cutoff < this.limit ? cutoff : this.limit) : 20;
    if (safe !== this.cutoff) this.coefficients(safe);
    const feedback = k > 0 ? k : 0;
    const half = this.step((this.last + input) * 0.5, feedback);
    const full = this.step(input, feedback);
    this.last = input;
    return (half + full) * 0.5 * (1 + feedback * ${FEEDBACK_MAKEUP});
  }

  /** Clears what decayed to nothing, so silence does not run into denormals; a non-finite state starts over. */
  settle() {
    if (!Number.isFinite(this.s1 + this.s2 + this.s3 + this.s4 + this.sh)) {
      this.reset();
      return;
    }
    if (Math.abs(this.s1) < 1e-18) this.s1 = 0;
    if (Math.abs(this.s2) < 1e-18) this.s2 = 0;
    if (Math.abs(this.s3) < 1e-18) this.s3 = 0;
    if (Math.abs(this.s4) < 1e-18) this.s4 = 0;
    if (Math.abs(this.sh) < 1e-18) this.sh = 0;
  }
}
`;

const PROCESSOR = "kitty-diode-ladder";

const PROCESSOR_SOURCE = `${LADDER_KERNEL_SOURCE}
class KittyDiodeLadder extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "frequency", defaultValue: 1000, minValue: 0, maxValue: 96000, automationRate: "a-rate" },
      { name: "sweep", defaultValue: 0, minValue: -4800, maxValue: 4800, automationRate: "a-rate" },
      { name: "feedback", defaultValue: 0, minValue: 0, maxValue: ${MAX_FEEDBACK}, automationRate: "k-rate" },
    ];
  }

  constructor() {
    super();
    this.kernel = new DiodeLadderKernel(sampleRate);
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0] && outputs[0][0];
    if (!output) return true;
    const input = inputs[0] && inputs[0][0];
    const frequency = parameters.frequency;
    const sweep = parameters.sweep;
    const k = parameters.feedback[0];
    const steadySweep = sweep.length === 1 ? Math.pow(2, sweep[0] / 1200) : 0;
    for (let index = 0; index < output.length; index += 1) {
      const base = frequency.length === 1 ? frequency[0] : frequency[index];
      const shift = sweep.length === 1 ? steadySweep : Math.pow(2, sweep[index] / 1200);
      output[index] = this.kernel.process(input ? input[index] : 0, base * shift, k);
    }
    this.kernel.settle();
    return true;
  }
}

registerProcessor("${PROCESSOR}", KittyDiodeLadder);
`;

/**
 * Kitty's acid resonance (0.5 to 9, as the q of the former biquads) as ladder
 * feedback. A diode ladder only squelches near its ringing point, so the knob
 * climbs fast at first and spends its upper half close to it.
 */
export function ladderFeedback(q: number): number {
  const amount = Number.isFinite(q) ? Math.max(0, Math.min(1, (q - 0.5) / (FULL_RESONANCE_Q - 0.5))) : 0;
  return (1 - (1 - amount) ** 2) * MAX_FEEDBACK;
}

/** The ladder's resonance as 0 (none) to 1 (fully up), for what follows it (the accent sweep). */
export function ladderResonance(q: number): number {
  return ladderFeedback(q) / MAX_FEEDBACK;
}

let moduleUrl: string | null = null;
const modules = new WeakMap<BaseAudioContext, Promise<boolean>>();
const loaded = new WeakSet<BaseAudioContext>();

/**
 * Loads the worklet into `context` once; resolves `false` where AudioWorklets
 * are missing or blocked, and the 303 then keeps its biquad filter.
 */
export function loadDiodeLadder(context: BaseAudioContext): Promise<boolean> {
  if (typeof AudioWorkletNode !== "function" || !context.audioWorklet || typeof URL.createObjectURL !== "function") return Promise.resolve(false);
  let pending = modules.get(context);
  if (!pending) {
    moduleUrl ??= URL.createObjectURL(new Blob([PROCESSOR_SOURCE], { type: "text/javascript" }));
    pending = context.audioWorklet.addModule(moduleUrl).then(() => {
      loaded.add(context);
      return true;
    }, () => false);
    modules.set(context, pending);
  }
  return pending;
}

export function diodeLadderLoaded(context: BaseAudioContext): boolean {
  return loaded.has(context);
}

export class DiodeLadder extends SoundNode {
  readonly name = "DiodeLadder";
  readonly input: AudioWorkletNode;
  readonly output: AudioWorkletNode;
  /** Shifts the cutoff in cents on top of the frequency (the accent sweep). */
  readonly sweep: Param;
  private readonly frequency: AudioParam;
  private readonly feedback: Param;

  constructor(cutoff: number) {
    super();
    const node = new AudioWorkletNode(this.context, PROCESSOR, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 1,
      channelCountMode: "explicit",
      channelInterpretation: "speakers",
    });
    this.input = this.output = node;
    this.frequency = node.parameters.get("frequency")!;
    this.frequency.value = cutoff;
    this.sweep = param(node.parameters.get("sweep")!, "cents", 0);
    this.feedback = param(node.parameters.get("feedback")!, "number", 0);
  }

  /** Lets a signal (a FrequencyEnvelope) set the cutoff, as `LeanFilter.modulateFrequency` does. */
  modulateFrequency(source: SoundNode | AudioNode): this {
    this.frequency.cancelScheduledValues(0);
    this.frequency.value = 0;
    connect(source, this.frequency);
    return this;
  }

  /** `q` as the former biquads took it (0.5 to 9). */
  setResonance(q: number, duration: number, time: number): void {
    this.feedback.rampTo(ladderFeedback(q), duration, time);
  }

  override dispose(): this {
    super.dispose();
    this.output.port.close();
    return this;
  }
}
