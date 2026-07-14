import { describe, expect, it } from "vitest";
import { createFactoryProject } from "@/domain/defaults";
import { isValidProject, sanitizeProject } from "@/domain/sanitize";
import { KittyStore } from "@/store/store";

describe("vollständiges Sanitizing", () => {
  it("klemmt Zahlen und rekonstruiert falsche Arraygrößen und IDs", () => {
    const damaged = structuredClone(createFactoryProject("acid")) as unknown as Record<string, unknown>;
    damaged.tempo = 999;
    damaged.swing = -8;
    damaged.masterVolume = Number.NaN;
    damaged.root = "H";
    damaged.scale = "chromatic";
    damaged.mix = [{ instrument: "unknown", volume: Number.POSITIVE_INFINITY }];
    damaged.scenes = [{ role: "warmup", name: "  Eigene Szene  ", tracks: [{ instrument: "acid", bars: [{ steps: [{ enabled: true, degree: 99, octave: -2, slide: "yes" }] }] }] }];
    const clean = sanitizeProject(damaged);
    expect(clean).toMatchObject({ profile: "acid", tempo: 180, swing: 0, masterVolume: 0.9, root: "A", scale: "minor" });
    expect(clean.mix).toHaveLength(5);
    expect(clean.scenes).toHaveLength(4);
    expect(clean.scenes[0]!.name).toBe("Eigene Szene");
    expect(clean.scenes.every((scene) => scene.tracks.length === 5)).toBe(true);
    expect(clean.scenes.every((scene) => scene.tracks.every((track) => track.bars.length === 4 && track.bars.every((bar) => bar.steps.length === 16)))).toBe(true);
    expect(clean.scenes[0]!.tracks[1]!.bars[0]!.steps[0]).toMatchObject({ degree: 6, octave: 1, slide: false });
    expect(isValidProject(clean)).toBe(true);
  });

  it("entfernt tonfremde Drumdaten und Acid-Slide aus anderen Spuren", () => {
    const source = structuredClone(createFactoryProject()) as unknown as Record<string, unknown>;
    const scenes = source.scenes as Array<{ tracks: Array<{ instrument: string; bars: Array<{ steps: Array<Record<string, unknown>> }> }> }>;
    const stab = scenes[0]!.tracks.find((entry) => entry.instrument === "stab")!;
    Object.assign(stab.bars[0]!.steps[0], { drumVoices: ["kick"], slide: true });
    expect(sanitizeProject(source).scenes[0]!.tracks[2]!.bars[0]!.steps[0]).toMatchObject({ drumVoices: [], slide: false });
  });

  it("bewahrt gültige Preset-IDs bestehender Projekte unabhängig vom Profil", () => {
    const existing = createFactoryProject("hard");
    existing.soundPresets = { drums: "warehouse", acid: "rubber", stab: "flash", rave: "siren", texture: "drone" };
    expect(sanitizeProject(existing).soundPresets).toEqual(existing.soundPresets);
    expect(isValidProject(existing)).toBe(true);
  });
});

describe("zentraler Store", () => {
  it("wählt einen belegten Step aus, ohne seinen Klangtyp zu verändern", () => {
    const store = new KittyStore(createFactoryProject());
    const existing = structuredClone(store.getState().project.scenes[0]!.tracks[0]!.bars[0]!.steps[0]!);

    store.dispatch({ type: "step/press", bar: 0, step: 0 });

    expect(store.getState().ui).toMatchObject({ selectedBar: 0, selectedStep: 0 });
    expect(store.getState().project.scenes[0]!.tracks[0]!.bars[0]!.steps[0]).toEqual(existing);
    expect(store.getState().canUndo).toBe(false);

    store.dispatch({ type: "step/press", bar: 0, step: 1 });
    expect(store.getState().project.scenes[0]!.tracks[0]!.bars[0]!.steps[1]!.enabled).toBe(true);
    store.dispatch({ type: "step/disable" });
    expect(store.getState().project.scenes[0]!.tracks[0]!.bars[0]!.steps[1]!.enabled).toBe(false);
  });

  it("nimmt UI-Auswahl nicht in Undo auf und macht Musikänderungen rückgängig", () => {
    const store = new KittyStore(createFactoryProject());
    store.dispatch({ type: "ui/select-track", track: "rave" });
    expect(store.getState().canUndo).toBe(false);
    store.dispatch({ type: "project/tempo", value: 160 });
    store.dispatch({ type: "history/undo" });
    expect(store.getState().project.tempo).toBe(150);
    store.dispatch({ type: "history/redo" });
    expect(store.getState().project.tempo).toBe(160);
  });

  it("setzt bei Projektwechsel Auswahl und vollständige Historie zurück", () => {
    const store = new KittyStore(createFactoryProject("hard"));
    store.dispatch({ type: "project/tempo", value: 170 });
    store.dispatch({ type: "ui/select-scene", scene: 3 });
    store.replaceProject(createFactoryProject("acid"));
    expect(store.getState()).toMatchObject({ canUndo: false, canRedo: false, ui: { selectedScene: 0, selectedTrack: "drums" }, project: { profile: "acid", tempo: 145 } });
    store.dispatch({ type: "history/undo" });
    expect(store.getState().project.profile).toBe("acid");
  });

  it("erzwingt Zwei-Stimmen-Limit und Drumkonflikte auch über Aktionen", () => {
    const store = new KittyStore(createFactoryProject());
    store.dispatch({ type: "ui/select-step", bar: 0, step: 0 });
    store.dispatch({ type: "step/drum-voice", voice: "closedHat" });
    store.dispatch({ type: "step/drum-voice", voice: "tom" });
    expect(store.getState().project.scenes[0]!.tracks[0]!.bars[0]!.steps[0]!.drumVoices).toEqual(["kick"]);
    store.dispatch({ type: "step/drum-voice", voice: "clap" });
    store.dispatch({ type: "step/drum-voice", voice: "snare" });
    expect(store.getState().project.scenes[0]!.tracks[0]!.bars[0]!.steps[0]!.drumVoices).toEqual(["kick", "clap"]);
  });
});
