import { describe, expect, it } from "vitest";
import { acidLegatoContext } from "@/audio/polish";
import { createFactoryProject } from "@/domain/defaults";
import { loopPosition, sceneSteps } from "@/domain/patterns";
import { isValidProject, sanitizeProject } from "@/domain/sanitize";
import { KittyStore } from "@/store/store";

describe("Spurlänge, Chance und Wiederholungen", () => {
  it("lässt kürzere Spuren gegen die vier Takte der Szene weiterlaufen", () => {
    expect(loopPosition(undefined, 70)).toEqual({ bar: 0, step: 6 });
    expect(loopPosition(48, 64)).toEqual({ bar: 1, step: 0 });
    expect(loopPosition(60, 125)).toEqual({ bar: 0, step: 5 });
    expect(sceneSteps({ pass: 2, bar: 1, step: 4 })).toBe(148);
  });

  it("speichert neue Felder nur, wenn sie vom Standard abweichen", () => {
    const project = createFactoryProject("acid");
    const drums = project.scenes[0]!.tracks.find((track) => track.instrument === "drums")!;
    const texture = project.scenes[0]!.tracks.find((track) => track.instrument === "texture")!;
    Object.assign(drums.bars[0]!.steps[0]!, { enabled: true, probability: 0.75, ratchet: 2 });
    Object.assign(drums.bars[1]!.steps[0]!, { enabled: true, probability: 0.3, ratchet: 9 });
    Object.assign(texture.bars[0]!.steps[0]!, { enabled: true, ratchet: 3 });
    drums.loopSteps = 60;
    texture.loopSteps = 61;
    const clean = sanitizeProject(project);
    const cleanDrums = clean.scenes[0]!.tracks.find((track) => track.instrument === "drums")!;
    const cleanTexture = clean.scenes[0]!.tracks.find((track) => track.instrument === "texture")!;
    expect(cleanDrums.bars[0]!.steps[0]).toMatchObject({ probability: 0.75, ratchet: 2 });
    expect(cleanDrums.bars[1]!.steps[0]).not.toHaveProperty("probability");
    expect(cleanDrums.bars[1]!.steps[0]).not.toHaveProperty("ratchet");
    expect(cleanTexture.bars[0]!.steps[0]).not.toHaveProperty("ratchet");
    expect(cleanDrums.loopSteps).toBe(60);
    expect(cleanTexture).not.toHaveProperty("loopSteps");
    expect(isValidProject(clean)).toBe(true);
    expect(JSON.stringify(sanitizeProject(createFactoryProject("hard")))).not.toMatch(/probability|ratchet|loopSteps/);
  });

  it("stellt Chance, Wiederholung und Spurlänge rückgängig machbar ein", () => {
    const store = new KittyStore(createFactoryProject("hybrid"));
    store.dispatch({ type: "step/press", bar: 0, step: 0 });
    store.dispatch({ type: "step/probability", value: 0.5 });
    store.dispatch({ type: "step/ratchet", value: 3 });
    store.dispatch({ type: "track/loop", value: 48 });
    const drums = () => store.getState().project.scenes[0]!.tracks.find((track) => track.instrument === "drums")!;
    expect(drums().bars[0]!.steps[0]).toMatchObject({ probability: 0.5, ratchet: 3 });
    expect(drums().loopSteps).toBe(48);
    store.dispatch({ type: "history/undo" });
    expect(drums()).not.toHaveProperty("loopSteps");
    store.dispatch({ type: "ui/select-track", track: "texture" });
    store.dispatch({ type: "step/press", bar: 0, step: 0 });
    store.dispatch({ type: "step/ratchet", value: 2 });
    expect(store.getState().project.scenes[0]!.tracks.find((track) => track.instrument === "texture")!.bars[0]!.steps[0]).not.toHaveProperty("ratchet");
  });

  it("lässt einen Acid-Slide nicht über das Ende einer kürzeren Spur hinweglaufen", () => {
    const project = createFactoryProject("acid");
    const acid = project.scenes[0]!.tracks.find((track) => track.instrument === "acid")!;
    acid.bars[2]!.steps[15] = { ...acid.bars[2]!.steps[15]!, enabled: true };
    acid.bars[3]!.steps[0] = { ...acid.bars[3]!.steps[0]!, enabled: true, slide: true };
    expect(acidLegatoContext(acid.bars, 2, 15).continues).toBe(true);
    expect(acidLegatoContext(acid.bars, 2, 15, 48).continues).toBe(false);
  });
});
