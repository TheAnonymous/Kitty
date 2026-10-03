<script setup lang="ts">
import { KvSlider } from "@kinky-vibes/ui";

/** A KvSlider that shows and announces its value with a unit ("35 %", "150 BPM") instead of the raw number. */
defineOptions({ inheritAttrs: false });
defineProps<{
  modelValue: number;
  min: number;
  max: number;
  step: number;
  /** The value as screen readers say it, and as shown unless `display` is given. */
  format: (value: number) => string;
  display?: (value: number) => string;
}>();
defineEmits<{ "update:modelValue": [value: number] }>();
</script>

<template>
  <div class="unit-slider">
    <KvSlider
      v-bind="$attrs"
      :model-value="modelValue"
      :min="min"
      :max="max"
      :step="step"
      :show-value="false"
      :aria-valuetext="format(modelValue)"
      @update:model-value="$emit('update:modelValue', Number($event))"
    />
    <output class="kv-slider__value" aria-hidden="true">{{ (display ?? format)(modelValue) }}</output>
  </div>
</template>
