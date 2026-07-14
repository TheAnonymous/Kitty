import { describe, expect, it } from "vitest";
import {
  acidStepParameters,
  presetDefinition,
  safeEffectParameters,
  SOUND_PRESET_DEFINITIONS,
  SOUND_SAFETY_LIMITS,
  soundSignature,
  type SoundPresetRecipe,
} from "@/domain/sound-presets";
import { SOUND_PRESETS, TRACK_KINDS, type TrackMacros } from "@/domain/types";

const macroCorners: TrackMacros[] = Array.from({ length: 32 }, (_, mask) => ({
  color: mask & 1 ? 1 : 0,
  pressure: mask & 2 ? 1 : 0,
  space: mask & 4 ? 1 : 0,
  motion: mask & 8 ? 1 : 0,
  density: mask & 16 ? 1 : 0,
}));

describe("typisierte Preset-Rezepte", () => {
  it("deckt alle 15 gespeicherten IDs exakt und spurtreu ab", () => {
    expect(TRACK_KINDS.flatMap((track) => SOUND_PRESET_DEFINITIONS[track])).toHaveLength(15);
    for (const track of TRACK_KINDS) {
      expect(SOUND_PRESET_DEFINITIONS[track].map((recipe) => recipe.id)).toEqual(SOUND_PRESETS[track]);
      expect(SOUND_PRESET_DEFINITIONS[track].every((recipe) => recipe.kind === track)).toBe(true);
    }
  });

  it("gibt jedem Preset eine eindeutige, ausschließlich endliche Klangsignatur", () => {
    const recipes = TRACK_KINDS.flatMap((track) => SOUND_PRESET_DEFINITIONS[track]) as SoundPresetRecipe[];
    expect(new Set(recipes.map(soundSignature)).size).toBe(recipes.length);
    for (const recipe of recipes) expect(allNumbers(recipe).every(Number.isFinite)).toBe(true);
  });

  it("klemmt alle Makro-Ecken und ungültige Werte in die zentralen Sicherheitsgrenzen", () => {
    const unsafe = { color: Number.NaN, pressure: Number.POSITIVE_INFINITY, space: -8, motion: 12, density: Number.NaN };
    for (const track of TRACK_KINDS) {
      for (const preset of SOUND_PRESETS[track]) {
        for (const macros of [...macroCorners, unsafe]) {
          const values = safeEffectParameters(track, preset, macros, true);
          expect(Object.values(values).every(Number.isFinite)).toBe(true);
          expect(values.cutoff).toBeGreaterThanOrEqual(SOUND_SAFETY_LIMITS.cutoff.min);
          expect(values.cutoff).toBeLessThanOrEqual(SOUND_SAFETY_LIMITS.cutoff.max);
          expect(values.q).toBeLessThanOrEqual(track === "acid" ? SOUND_SAFETY_LIMITS.resonance.acid : SOUND_SAFETY_LIMITS.resonance.other);
          expect(values.ratio).toBeLessThanOrEqual(SOUND_SAFETY_LIMITS.compressionRatio);
          expect(values.feedback).toBeLessThanOrEqual(SOUND_SAFETY_LIMITS.feedback);
          expect(values.delayWet).toBeLessThanOrEqual(SOUND_SAFETY_LIMITS.wet);
          expect(values.reverbWet).toBeLessThanOrEqual(SOUND_SAFETY_LIMITS.wet);
          expect(values.saturation).toBeLessThanOrEqual(SOUND_SAFETY_LIMITS.saturation);
          expect(Object.values(values).every((value) => value >= 0 || value === values.threshold)).toBe(true);
        }
      }
    }
  });

  it("verstärkt Acid-Accents sicher und erhält das längere monophone Slide", () => {
    for (const preset of SOUND_PRESETS.acid) {
      const plain = acidStepParameters(preset, false, false);
      const accent = acidStepParameters(preset, true, false);
      const slide = acidStepParameters(preset, false, true);
      expect(accent.filterBoost).toBeGreaterThan(plain.filterBoost);
      expect(accent.saturationBoost).toBeGreaterThan(plain.saturationBoost);
      expect(accent.velocityMultiplier).toBeGreaterThan(plain.velocityMultiplier);
      expect(slide.portamento).toBeGreaterThan(plain.portamento);

      const macros = { color: 0.5, pressure: 0.5, space: 0.5, motion: 0.5, density: 0.5 };
      const normalEffects = safeEffectParameters("acid", preset, macros);
      const accentEffects = safeEffectParameters("acid", preset, macros, true);
      expect(accentEffects.cutoff).toBeGreaterThan(normalEffects.cutoff);
      expect(accentEffects.saturation).toBeGreaterThan(normalEffects.saturation);
    }
  });

  it("beschreibt getrennte Drum-Layer samt Stahl-Transient und stabilem Rumble-Sub", () => {
    const warehouse = presetDefinition("drums", "warehouse").synthesis;
    const steel = presetDefinition("drums", "steel").synthesis;
    const rumble = presetDefinition("drums", "rumble").synthesis;
    expect(warehouse.kick.transient).toBeGreaterThan(0);
    expect(steel.kick.transient).toBeGreaterThan(warehouse.kick.transient);
    expect(steel.hats.resonance).toBeGreaterThan(warehouse.hats.resonance);
    expect(rumble.kick.subTail).toMatchObject({ cutoff: 110 });
    expect(rumble.kick.subTail!.decay).toBeGreaterThan(warehouse.snare.decay);
    expect(new Set([warehouse.snare.bodyNote, steel.snare.bodyNote, rumble.snare.bodyNote]).size).toBe(3);
  });

  it("nutzt echte FM-Rezepte, vierfachen Hoover-Unison und einen aufsteigenden Riser", () => {
    expect(presetDefinition("stab", "flash").synthesis).toMatchObject({ engine: "fm" });
    expect(presetDefinition("rave", "siren").synthesis).toMatchObject({ engine: "fm" });
    expect(presetDefinition("rave", "hoover")).toMatchObject({
      synthesis: { engine: "analog", oscillator: "fatsawtooth", unisonCount: 4 },
      modulation: { chorusWet: expect.any(Number), vibratoDepth: expect.any(Number) },
    });
    const riser = presetDefinition("texture", "riser").synthesis;
    expect(riser.source).toBe("riser");
    if (riser.source !== "riser") throw new Error("Riser-Rezept fehlt");
    expect(riser.filterEnd).toBeGreaterThan(riser.filterStart);
    expect(riser.sweepSeconds).toBeGreaterThan(0);
  });
});

function allNumbers(value: unknown): number[] {
  if (typeof value === "number") return [value];
  if (Array.isArray(value)) return value.flatMap(allNumbers);
  if (typeof value === "object" && value !== null) return Object.values(value).flatMap(allNumbers);
  return [];
}
