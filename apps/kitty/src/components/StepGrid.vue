<script setup lang="ts">
import { nextTick, ref } from "vue";
import type { TrackPattern } from "../domain/types";

const props = defineProps<{
  pattern: TrackPattern;
  selectedBar: number;
  selectedStep: number | null;
  locks: readonly boolean[];
  playheadBar: number;
  playheadStep: number;
  playing: boolean;
}>();

const emit = defineEmits<{
  cycle: [bar: number, step: number];
  selectBar: [bar: number];
  toggleLock: [bar: number];
}>();

const buttons = ref<HTMLButtonElement[]>([]);
const focused = ref(0);

function focus(index: number): void {
  focused.value = Math.max(0, Math.min(63, index));
  void nextTick(() => buttons.value[focused.value]?.focus());
}

function onKeydown(event: KeyboardEvent, index: number): void {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    emit("cycle", Math.floor(index / 16), index % 16);
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

function stepLabel(bar: number, step: number): string {
  const current = props.pattern.bars[bar]?.steps[step];
  const state = !current?.enabled ? "aus" : current.dynamics === "accent" ? "Akzent" : current.dynamics === "ghost" ? "leise" : "aktiv";
  return `Takt ${bar + 1}, Step ${step + 1}, ${state}`;
}
</script>

<template>
  <div class="step-grid" role="grid" :aria-label="`Step-Raster ${pattern.instrument}`">
    <div v-for="(bar, barIndex) in pattern.bars" :key="barIndex" class="step-row" role="row">
      <button
        class="bar-label"
        type="button"
        role="gridcell"
        :class="{ 'is-selected': selectedBar === barIndex }"
        :aria-selected="selectedBar === barIndex"
        :aria-label="`Takt ${barIndex + 1} auswählen`"
        @click="emit('selectBar', barIndex)"
      >
        {{ barIndex + 1 }}
      </button>
      <div class="step-cells" role="presentation">
        <button
          v-for="(step, stepIndex) in bar.steps"
          :key="stepIndex"
          :ref="(element) => { if (element) buttons[barIndex * 16 + stepIndex] = element as HTMLButtonElement; }"
          type="button"
          role="gridcell"
          class="kitty-step"
          :class="[
            step.enabled && `is-${step.dynamics}`,
            selectedBar === barIndex && selectedStep === stepIndex && 'is-selected',
            playing && playheadBar === barIndex && playheadStep === stepIndex && 'is-playing',
            step.slide && 'has-slide',
          ]"
          :data-bar="barIndex"
          :data-step="stepIndex"
          :aria-label="stepLabel(barIndex, stepIndex)"
          :aria-selected="step.enabled"
          :tabindex="focused === barIndex * 16 + stepIndex ? 0 : -1"
          @focus="focused = barIndex * 16 + stepIndex"
          @keydown="onKeydown($event, barIndex * 16 + stepIndex)"
          @click="emit('cycle', barIndex, stepIndex)"
        >
          <span class="step-number">{{ stepIndex + 1 }}</span>
          <span v-if="step.enabled" class="step-mark" aria-hidden="true" />
        </button>
      </div>
      <button
        type="button"
        role="gridcell"
        class="lock-button"
        :class="{ 'is-locked': locks[barIndex] }"
        :aria-label="`Takt ${barIndex + 1} ${locks[barIndex] ? 'entsperren' : 'sperren'}`"
        :aria-selected="locks[barIndex]"
        @click="emit('toggleLock', barIndex)"
      >
        {{ locks[barIndex] ? "🔒" : "○" }}
      </button>
    </div>
  </div>
</template>
