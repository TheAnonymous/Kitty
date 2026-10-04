import { Gain, LeanFilter, SoundNode, WaveShaper } from "klangwerk/tone";

/**
 * The pedal most acid runs through after the 303: gain into an asymmetric
 * clip (soft knee, hard ceiling, the positive side harder, as an op-amp
 * distortion does), a tone low-pass against the fizz, and the level brought
 * back, so turning it up makes the line nastier rather than just louder.
 */
const PAD = 0.3;
const MAX_GAIN = 14;
/** Above the clean level, a full drive may sound this much louder (dB). */
const DRIVE_LIFT_DB = 2;

export function driveSample(value: number): number {
  const positive = Math.tanh(2.2 * Math.max(0, value)) / Math.tanh(2.2);
  const negative = (0.9 * Math.tanh(1.6 * Math.min(0, value))) / Math.tanh(1.6);
  return value >= 0 ? positive : negative;
}

function driveGain(amount: number): number {
  return PAD * (1 + amount * MAX_GAIN);
}

/** Output gain per drive amount, from a full-scale sine: clean stays at unity, full drive lifts by `DRIVE_LIFT_DB`. */
const COMPENSATION = Array.from({ length: 11 }, (_, index) => {
  const amount = index / 10;
  const gain = driveGain(amount);
  let sum = 0;
  const points = 2_048;
  for (let point = 0; point < points; point += 1) {
    const input = Math.sin((2 * Math.PI * point) / points) * gain;
    sum += driveSample(Math.max(-1, Math.min(1, input))) ** 2;
  }
  const rms = Math.sqrt(sum / points);
  return (Math.SQRT1_2 * 10 ** ((DRIVE_LIFT_DB * amount) / 20)) / rms;
});

export function driveCompensation(amount: number): number {
  const position = Math.max(0, Math.min(1, amount)) * 10;
  const lower = Math.floor(position);
  const upper = Math.min(10, lower + 1);
  const fraction = position - lower;
  return COMPENSATION[lower]! * (1 - fraction) + COMPENSATION[upper]! * fraction;
}

export class AcidDrive extends SoundNode {
  readonly name = "AcidDrive";
  readonly input = new Gain(driveGain(0));
  readonly output = new Gain(driveCompensation(0));
  private readonly shaper = new WaveShaper(driveSample, 4_096);
  private readonly tone: LeanFilter;

  constructor(tone: number) {
    super();
    this.shaper.oversample = "4x";
    this.tone = new LeanFilter({ type: "lowpass", frequency: tone, Q: 0.6, rolloff: -12 });
    this.input.chain(this.shaper, this.tone, this.output);
  }

  /** `amount` 0 is a clean buffer, 1 the pedal fully up. */
  setDrive(amount: number, duration: number, time?: number): void {
    const safe = Number.isFinite(amount) ? Math.max(0, Math.min(1, amount)) : 0;
    this.input.gain.rampTo(driveGain(safe), duration, time);
    this.output.gain.rampTo(driveCompensation(safe), duration, time);
  }

  override dispose(): this {
    super.dispose();
    this.shaper.dispose();
    this.tone.dispose();
    return this;
  }
}
