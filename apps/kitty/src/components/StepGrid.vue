<script setup lang="ts">
import { nextTick, ref } from "vue";
import { allowsRatchet, stepChance, stepRatchet } from "../domain/patterns";
import { DEGREE_LABELS } from "../domain/music";
import type { Step, TrackPattern } from "../domain/types";
import { vHint } from "../hint";
import { DRUM_LABELS, DRUM_SHORT } from "../labels";

const props = defineProps<{
  pattern: TrackPattern;
  /** The track's name for screen readers, e.g. "Drum Machine". */
  trackName: string;
  selectedBar: number;
  selectedStep: number | null;
  locks: readonly boolean[];
  playheadBar: number;
  playheadStep: number;
  playing: boolean;
}>();

const emit = defineEmits<{
  press: [bar: number, step: number];
  clear: [bar: number, step: number];
  toggleLock: [bar: number];
}>();

const buttons = ref<HTMLButtonElement[]>([]);
const focused = ref(0);
/** The cell last pressed with a pointer: Space there is Start/Stop, as after any click, not a second press. */
let pointerCell = -1;

function focus(index: number): void {
  pointerCell = -1;
  focused.value = Math.max(0, Math.min(63, index));
  void nextTick(() => buttons.value[focused.value]?.focus());
}

/** Puts the keyboard into the grid: on the selected step, else where it was last. */
function focusGrid(): void {
  focus(props.selectedStep === null ? focused.value : props.selectedBar * 16 + props.selectedStep);
}

defineExpose({ focusGrid });

function onKeydown(event: KeyboardEvent, index: number): void {
  if (event.key === " " && index === pointerCell) return;
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    emit("press", Math.floor(index / 16), index % 16);
    return;
  }
  if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    emit("clear", Math.floor(index / 16), index % 16);
    return;
  }
  let target: number | null = null;
  if (event.key === "ArrowRight") target = index + 1;
  if (event.key === "ArrowLeft") target = index - 1;
  if (event.key === "ArrowDown") target = index + 16;
  if (event.key === "ArrowUp") target = index - 16;
  if (event.key === "Home") target = Math.floor(index / 16) * 16;
  if (event.key === "End") target = Math.floor(index / 16) * 16 + 15;
  if (target !== null) {
    event.preventDefault();
    focus(target);
  }
}

function isSelected(bar: number, step: number): boolean {
  return props.selectedBar === bar && props.selectedStep === step;
}

function outside(bar: number, step: number): boolean {
  return bar * 16 + step >= (props.pattern.loopSteps ?? 64);
}

function chance(step: Step): number {
  return step.enabled ? stepChance(step) : 1;
}

function hits(step: Step): number {
  return step.enabled && allowsRatchet(props.pattern.instrument) ? stepRatchet(step) : 1;
}

/** What the cell shows of an active step: its drum voices as letters, or the scale degree as a number. */
function content(step: Step): string {
  if (!step.enabled) return "";
  if (props.pattern.instrument === "drums") return step.drumVoices.map((voice) => DRUM_SHORT[voice]).join("");
  return String(step.degree + 1);
}

function sound(step: Step): string {
  if (props.pattern.instrument === "drums") return step.drumVoices.map((voice) => DRUM_LABELS[voice]).join(" und ");
  return `${DEGREE_LABELS[step.degree] ?? "Grundton"}, Oktave ${step.octave}`;
}

function stepLabel(bar: number, index: number): string {
  const current = props.pattern.bars[bar]?.steps[index];
  const parts = [`Takt ${bar + 1}, Step ${index + 1}`];
  if (!current?.enabled) parts.push("aus");
  else {
    parts.push(sound(current));
    if (current.dynamics !== "normal") parts.push(current.dynamics === "accent" ? "Akzent" : "leise");
    if (current.slide && props.pattern.instrument === "acid") parts.push("Slide");
    if (chance(current) < 1) parts.push(`spielt zu ${Math.round(chance(current) * 100)} %`);
    if (hits(current) > 1) parts.push(`${hits(current)} schnelle Wiederholungen`);
  }
  if (outside(bar, index)) parts.push("außerhalb der Spurlänge");
  return parts.join(", ");
}
</script>

<template>
  <div class="step-grid" role="group" :aria-label="`Step-Raster ${trackName}`">
    <div v-for="(bar, barIndex) in pattern.bars" :key="barIndex" class="step-row" role="group" :aria-label="`Takt ${barIndex + 1}`">
      <span class="bar-label" :class="{ 'is-selected': selectedStep !== null && selectedBar === barIndex }" aria-hidden="true">{{ barIndex + 1 }}</span>
      <div class="step-cells">
        <button
          v-for="(step, stepIndex) in bar.steps"
          :key="stepIndex"
          :ref="(element) => { if (element) buttons[barIndex * 16 + stepIndex] = element as HTMLButtonElement; }"
          type="button"
          class="kitty-step"
          :class="[
            step.enabled && `is-${step.dynamics}`,
            isSelected(barIndex, stepIndex) && 'is-selected',
            playing && playheadBar === barIndex && playheadStep === stepIndex && 'is-playing',
            step.slide && 'has-slide',
            outside(barIndex, stepIndex) && 'is-outside',
          ]"
          :data-bar="barIndex"
          :data-step="stepIndex"
          :data-state="step.enabled ? 'on' : 'off'"
          :aria-label="stepLabel(barIndex, stepIndex)"
          :aria-current="isSelected(barIndex, stepIndex) ? 'true' : undefined"
          :tabindex="focused === barIndex * 16 + stepIndex ? 0 : -1"
          @focus="focused = barIndex * 16 + stepIndex"
          @pointerdown="pointerCell = barIndex * 16 + stepIndex"
          @keydown="onKeydown($event, barIndex * 16 + stepIndex)"
          @click="emit('press', barIndex, stepIndex)"
        >
          <span v-if="content(step)" class="step-content">{{ content(step) }}</span>
          <span v-else class="step-number">{{ stepIndex + 1 }}</span>
          <small v-if="chance(step) < 1" class="step-chance">{{ Math.round(chance(step) * 100) }}</small>
          <small v-if="hits(step) > 1" class="step-ratchet">×{{ hits(step) }}</small>
        </button>
      </div>
      <button
        v-hint="'Schützt den Takt vor Variation (V) und Typisch (R)'"
        type="button"
        class="lock-button"
        :class="{ 'is-locked': locks[barIndex] }"
        :aria-label="`Takt ${barIndex + 1} schützen`"
        :aria-pressed="locks[barIndex]"
        @click="emit('toggleLock', barIndex)"
      >
        {{ locks[barIndex] ? "🔒" : "○" }}
      </button>
    </div>
  </div>
</template>
