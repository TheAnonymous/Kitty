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

describe("Acid-Idiom", () => {
  const acidLine = (profile: "hard" | "acid" | "hybrid", role: "warmup" | "drive" | "break" | "peak", seed: number) => generateTypicalPattern("acid", profile, role, seed);

  it("spielt 303-Linien dicht, grundtonlastig, mit Oktavsprüngen, Akzenten und Slides", () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const bars = acidLine("acid", "drive", seed);
      const notes = bars.flatMap((bar) => bar.steps.filter((step) => step.enabled));
      expect(notes.length / 4).toBeGreaterThanOrEqual(10);
      // The root leads clearly: more often than any other degree, and at least a third of the line.
      const counts = Array.from({ length: 7 }, (_, degree) => notes.filter((note) => note.degree === degree).length);
      expect(counts[0]!).toBeGreaterThan(Math.max(...counts.slice(1)));
      expect(counts[0]! / notes.length).toBeGreaterThanOrEqual(0.33);
      expect(new Set(notes.map((note) => note.octave))).toEqual(new Set([2, 3]));
      const accents = bars[0]!.steps.filter((step) => step.enabled && step.dynamics === "accent").length;
      expect(accents).toBeGreaterThanOrEqual(2);
      // A slide always glides in from a note.
      for (const bar of bars) bar.steps.forEach((step, index) => { if (step.enabled && step.slide) expect(bar.steps[index - 1]?.enabled).toBe(true); });
    }
  });

  it("wiederholt ein Motiv und antwortet am Ende der Phrase", () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const bars = acidLine("hybrid", "drive", seed);
      // The third bar repeats the first; the last bar answers it.
      expect(bars[2]).toEqual(bars[0]);
      expect(bars[3]).not.toEqual(bars[2]);
      // The answer keeps the downbeat.
      expect(bars[3]!.steps[0]).toEqual(bars[0]!.steps[0]);
    }
  });

  it("lässt den Break dünner als den Peak", () => {
    const count = (role: "break" | "peak") => acidLine("acid", role, 7).flatMap((bar) => bar.steps.filter((step) => step.enabled)).length;
    expect(count("break")).toBeLessThan(count("peak"));
  });
});

describe("Techno-Groove", () => {
  const voicesAt = (role: "warmup" | "drive" | "break" | "peak", profile: "hard" | "acid" | "hybrid", seed = 3) => generateTypicalPattern("drums", profile, role, seed);

  it("setzt die offene Hat auf den Offbeat und geschlossene Hats dazwischen", () => {
    for (const bar of voicesAt("drive", "hybrid").slice(0, 3)) {
      for (const offbeat of [2, 6, 10]) expect(bar.steps[offbeat]!.drumVoices).toContain("openHat");
      expect(bar.steps.filter((step) => step.drumVoices.includes("closedHat") && step.enabled).length).toBeGreaterThanOrEqual(2);
      expect(bar.steps[4]!.drumVoices).toEqual(["kick", "clap"]);
    }
  });

  it("lässt im Break die Kick weg, bringt im Peak den Ride und hält das Warm-up offen", () => {
    for (const bar of voicesAt("break", "acid")) expect(bar.steps.some((step) => step.drumVoices.includes("kick") && step.enabled)).toBe(false);
    expect(voicesAt("peak", "acid")[0]!.steps[2]!.drumVoices).toEqual(["openHat", "ride"]);
    expect(voicesAt("peak", "hard")[0]!.steps.some((step) => step.drumVoices.includes("ride"))).toBe(false);
    // The first warm-up bar leaves its sixteenths free for the player.
    expect(voicesAt("warmup", "hybrid")[0]!.steps[1]!.enabled).toBe(false);
  });

  it("liefert mit Typisch einen anderen Groove", () => {
    const grooves = new Set(Array.from({ length: 12 }, (_, seed) => JSON.stringify(voicesAt("drive", "acid", seed))));
    expect(grooves.size).toBeGreaterThan(6);
  });
});
