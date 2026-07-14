import { describe, expect, it } from "vitest";
import { createFactoryProject } from "@/domain/defaults";
import { isScaleTone, scaleDegreeMidi } from "@/domain/music";
import { generateTypicalPattern, sanitizeDrumVoices, varyPattern, replaceWithTypical } from "@/domain/patterns";
import { ROOT_NOTES, SCALES, TRACK_KINDS } from "@/domain/types";

describe("skalensichere Musik", () => {
  it("liefert für jeden Grundton, jede Skala, Tonrolle und Oktave nur Skal­töne", () => {
    for (const root of ROOT_NOTES) {
      for (const scale of SCALES) {
        for (let degree = 0; degree < 7; degree += 1) {
          for (let octave = 1; octave <= 5; octave += 1) {
            expect(isScaleTone(root, scale, scaleDegreeMidi(root, scale, degree, octave))).toBe(true);
          }
        }
      }
    }
  });

  it("erzeugt die drei bestätigten Werkprofile ohne versteckte Profilkopplung", () => {
    expect(createFactoryProject("hard")).toMatchObject({ profile: "hard", tempo: 155, root: "F", scale: "phrygian", soundPresets: { drums: "rumble", acid: "venom", stab: "concrete", rave: "hoover", texture: "noise" } });
    expect(createFactoryProject("acid")).toMatchObject({ profile: "acid", tempo: 145, root: "A", scale: "minor", soundPresets: { drums: "steel", acid: "silverbox", stab: "chord", rave: "pulse", texture: "noise" } });
    expect(createFactoryProject()).toMatchObject({ profile: "hybrid", tempo: 150, root: "F#", scale: "minor", soundPresets: { drums: "warehouse", acid: "silverbox", stab: "concrete", rave: "hoover", texture: "noise" } });
  });
});

describe("deterministischer Pattern-Generator", () => {
  it("erzeugt für jede Spur deterministische vier Takte mit tragenden Ankern", () => {
    for (const track of TRACK_KINDS) {
      const first = generateTypicalPattern(track, "hybrid", "peak", 42);
      const second = generateTypicalPattern(track, "hybrid", "peak", 42);
      expect(first).toEqual(second);
      expect(first).toHaveLength(4);
      for (const bar of first) {
        expect(bar.steps).toHaveLength(16);
        if (track === "drums") {
          for (const anchor of [0, 4, 8, 12]) expect(bar.steps[anchor]!.drumVoices).toContain("kick");
        } else {
          expect(bar.steps[0]).toMatchObject({ enabled: true, degree: 0 });
          if (track === "acid") expect(bar.steps[8]).toMatchObject({ enabled: true, degree: 0 });
        }
      }
    }
  });

  it("variiert deterministisch, respektiert Sperren und erhält alle vorhandenen Anker", () => {
    const source = createFactoryProject().scenes[3]!.tracks.find((entry) => entry.instrument === "acid")!;
    const first = structuredClone(source);
    const second = structuredClone(source);
    const locked = structuredClone(source.bars[0]);
    expect(varyPattern(first, "bold", [true, false, false, false])).toBe(true);
    expect(varyPattern(second, "bold", [true, false, false, false])).toBe(true);
    expect(first).toEqual(second);
    expect(first.bars[0]).toEqual(locked);
    for (const bar of first.bars) {
      expect(bar.steps[0]).toMatchObject({ enabled: true, degree: 0 });
      expect(bar.steps[8]).toMatchObject({ enabled: true, degree: 0 });
    }
  });

  it("ersetzt typische Patterns nur in ungesperrten Takten", () => {
    const pattern = structuredClone(createFactoryProject("hard").scenes[1]!.tracks[0]!);
    const locked = structuredClone(pattern.bars[1]);
    expect(replaceWithTypical(pattern, "hard", "drive", [false, true, false, false])).toBe(true);
    expect(pattern.bars[1]).toEqual(locked);
  });

  it("begrenzt Drum-Layer auf zwei konfliktfreie, eindeutige Stimmen", () => {
    expect(sanitizeDrumVoices(["kick", "tom", "snare", "clap"])).toEqual(["kick", "snare"]);
    expect(sanitizeDrumVoices(["openHat", "closedHat", "clap"])).toEqual(["openHat", "clap"]);
    expect(sanitizeDrumVoices(["clap", "clap"])).toEqual(["clap"]);
    expect(sanitizeDrumVoices([])).toEqual(["kick"]);
  });
});
