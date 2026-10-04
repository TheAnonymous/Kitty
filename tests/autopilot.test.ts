import { describe, expect, it } from "vitest";
import { Autopilot, PRE_DROP_BARS, type AutopilotPhase, type AutopilotPlan } from "@/autopilot";
import { createFactoryProject } from "@/domain/defaults";
import { KittyStore } from "@/store/store";

interface Heard {
  bar: number;
  step: number;
  phase: AutopilotPhase;
  phaseBar: number;
  tension: number;
  plan: AutopilotPlan;
}

/** Plays `bars` bars through the autopilot; with a store, its changes land there as in the app. */
function play(autopilot: Autopilot, bars: number, store?: KittyStore): Heard[] {
  const heard: Heard[] = [];
  for (let bar = 0; bar < bars; bar += 1) {
    for (let step = 0; step < 16; step += 1) {
      const project = store?.getState().project ?? createFactoryProject("acid");
      const plan = autopilot.step(step, project);
      for (const action of plan.actions) store?.dispatch(action);
      const view = autopilot.view(step)!;
      heard.push({ bar, step, phase: view.phase, phaseBar: view.bar, tension: view.tension, plan });
    }
  }
  return heard;
}

function phaseRuns(heard: Heard[]): [AutopilotPhase, number][] {
  const runs: [AutopilotPhase, number][] = [];
  for (const entry of heard.filter((item) => item.step === 0)) {
    const last = runs.at(-1);
    if (last?.[0] === entry.phase) last[1] += 1;
    else runs.push([entry.phase, 1]);
  }
  return runs;
}

describe("Auto-Acid", () => {
  it("durchläuft Einstieg, Fluss, Aufbau, Break, Peak und Abbau und beginnt dann einen neuen Bogen", () => {
    const autopilot = new Autopilot({ arcLength: "short", random: () => 0.5 });
    autopilot.start(true, createFactoryProject("acid"));
    expect(phaseRuns(play(autopilot, 4 + 32 + 10))).toEqual([
      ["intro", 4], ["groove", 8], ["build", 8], ["break", 4], ["peak", 8], ["cooldown", 4], ["groove", 8], ["build", 2],
    ]);
    expect(autopilot.view()?.arc).toBe(2);
  });

  it("beginnt bei laufender Musik direkt im Fluss", () => {
    const autopilot = new Autopilot({ arcLength: "short" });
    const plan = autopilot.start(false, createFactoryProject());
    expect(plan.scene).toBe(1);
    expect(phaseRuns(play(autopilot, 2))[0]).toEqual(["groove", 2]);
  });

  it("stellt Szenen einen Schlag vor dem Takt ein und lässt den Drop nach dem Riser kommen", () => {
    const autopilot = new Autopilot({ arcLength: "short", random: () => 0.5 });
    expect(autopilot.start(true, createFactoryProject("acid")).scene).toBe(0);
    const heard = play(autopilot, 4 + 32);
    const scenes = heard.filter((entry) => entry.plan.scene !== undefined);
    expect(scenes.every((entry) => entry.step === 12)).toBe(true);
    expect(scenes.map((entry) => entry.plan.scene)).toEqual([1, 1, 2, 3, 1, 1]);

    const breakOn = heard.filter((entry) => entry.plan.breakOn);
    expect(breakOn).toHaveLength(1);
    expect(breakOn[0]).toMatchObject({ phase: "break", phaseBar: 4 - PRE_DROP_BARS + 1, step: 0 });
    const drop = heard.filter((entry) => entry.plan.drop);
    expect(drop).toHaveLength(1);
    expect(drop[0]).toMatchObject({ phase: "break", phaseBar: 4, step: 12 });
    expect(drop[0]!.plan.scene).toBe(3);
  });

  it("lässt die Spannung im Aufbau steigen und im Abbau fallen, der 303-Filter folgt ihr", () => {
    const autopilot = new Autopilot({ arcLength: "medium", random: () => 0.5 });
    autopilot.start(true, createFactoryProject("acid"));
    const heard = play(autopilot, 8 + 64);
    const tension = (phase: AutopilotPhase) => heard.filter((entry) => entry.phase === phase && entry.step === 0).map((entry) => entry.tension);
    const build = tension("build");
    expect(build.every((value, index) => index === 0 || value > build[index - 1]!)).toBe(true);
    const cooldown = tension("cooldown");
    expect(cooldown.every((value, index) => index === 0 || value < cooldown[index - 1]!)).toBe(true);
    expect(Math.max(...tension("break"))).toBeGreaterThan(Math.max(...tension("groove")));

    const acid = (phase: AutopilotPhase) => heard
      .filter((entry) => entry.phase === phase)
      .flatMap((entry) => entry.plan.actions)
      .flatMap((action) => action.type === "auto/macros" ? action.changes.filter((change) => change.track === "acid") : []);
    const pressure = (phase: AutopilotPhase) => Math.max(...acid(phase).map((change) => change.values.pressure ?? 0));
    expect(pressure("break")).toBeGreaterThan(pressure("groove"));
    for (const change of acid("peak")) expect(change.values.color).toBeGreaterThanOrEqual(0);
    for (const change of acid("peak")) expect(change.values.color).toBeLessThanOrEqual(1);
  });

  it("öffnet im Einstieg einen Tiefpass und setzt am Ende des Aufbaus einen Hochpass-Riser", () => {
    const autopilot = new Autopilot({ arcLength: "short" });
    const start = autopilot.start(true, createFactoryProject("acid"));
    expect(start.filter).toBeLessThan(-0.4);
    const heard = play(autopilot, 4 + 32);
    const filters = (phase: AutopilotPhase) => heard.filter((entry) => entry.phase === phase && entry.plan.filter !== undefined).map((entry) => entry.plan.filter!);
    expect(Math.max(...filters("intro"))).toBeLessThanOrEqual(0);
    expect(filters("intro").at(-1)).toBeGreaterThan(-0.05);
    expect(Math.max(...filters("build"))).toBeGreaterThan(0.3);
    expect(Math.min(...filters("cooldown"))).toBeLessThan(-0.2);
    // The engine's own riser owns the high-pass during the break.
    expect(heard.filter((entry) => entry.phase === "break" && entry.phaseBar > 1 && entry.plan.filter !== undefined)).toEqual([]);
  });

  it("nimmt Stab und Rave im Einstieg heraus, lässt Kit und 303 aber immer spielen", () => {
    const autopilot = new Autopilot({ arcLength: "short" });
    expect(autopilot.start(true, createFactoryProject()).mutes).toEqual({ stab: true, rave: true, texture: false });
    const heard = play(autopilot, 4 + 32);
    const mutes = heard.flatMap((entry) => Object.keys(entry.plan.mutes ?? {}));
    expect(mutes).not.toContain("drums");
    expect(mutes).not.toContain("acid");
    expect(heard.find((entry) => entry.phase === "groove" && entry.plan.mutes)?.plan.mutes).toBeUndefined();
    // The next flow is planned already: only the rave lead still waits.
    expect(autopilot.mutedTracks).toEqual(["rave"]);
  });
});

describe("Auto-Acid im Store", () => {
  it("verändert die Musik über Bögen hinweg und macht den ganzen Lauf zu einem Undo-Schritt", () => {
    const store = new KittyStore(createFactoryProject("hybrid"));
    const before = structuredClone(store.getState().project);
    store.armCheckpoint();
    const autopilot = new Autopilot({ arcLength: "short", random: () => 0.5 });
    for (const action of autopilot.start(true, store.getState().project).actions) store.dispatch(action);
    play(autopilot, 4 + 32 * 2 + 1, store);

    const project = store.getState().project;
    expect(project.scenes[1]!.tracks.find((track) => track.instrument === "acid")!.bars).not.toEqual(before.scenes[1]!.tracks.find((track) => track.instrument === "acid")!.bars);
    expect(project.soundPresets.acid).not.toBe(before.soundPresets.acid);
    expect(project.scenes[3]!.tracks.find((track) => track.instrument === "acid")!.macros).not.toEqual(before.scenes[3]!.tracks.find((track) => track.instrument === "acid")!.macros);
    expect(store.getState().autosave).toBe("saving");

    store.dispatch({ type: "history/undo" });
    expect(store.getState().project).toEqual(before);
    expect(store.getState().canUndo).toBe(false);
  });

  it("wechselt nach vier Bögen die Tonart eine Quarte höher", () => {
    const store = new KittyStore(createFactoryProject("acid"));
    const autopilot = new Autopilot({ arcLength: "short", random: () => 0.5 });
    autopilot.start(true, store.getState().project);
    play(autopilot, 4 + 32 * 4 + 1, store);
    expect(store.getState().project.root).toBe("D");
  });

  it("lässt geschützte Takte unangetastet", () => {
    const store = new KittyStore(createFactoryProject("acid"));
    for (let bar = 0; bar < 4; bar += 1) {
      store.dispatch({ type: "ui/select-track", track: "acid" });
      store.dispatch({ type: "ui/toggle-lock", bar });
    }
    const acidBars = () => store.getState().project.scenes.map((scene) => scene.tracks.find((track) => track.instrument === "acid")!.bars);
    const before = structuredClone(acidBars());
    const autopilot = new Autopilot({ arcLength: "short" });
    autopilot.start(true, store.getState().project);
    play(autopilot, 4 + 32 * 3, store);
    expect(acidBars()).toEqual(before);
  });
});
