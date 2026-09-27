import { describe, expect, it } from "vitest";
import { BarQueuedTransport } from "@/audio/transport";

describe("Szenen-Transport", () => {
  it("schaltet vorgemerkte Szenen ausschließlich an der nächsten Taktgrenze", () => {
    const transport = new BarQueuedTransport();
    transport.start(0);
    expect(transport.next()).toEqual({ scene: 0, bar: 0, step: 0, switched: false, pass: 0 });
    transport.queue(2);
    for (let step = 1; step < 16; step += 1) expect(transport.next().scene).toBe(0);
    expect(transport.next()).toEqual({ scene: 2, bar: 0, step: 0, switched: true, pass: 0 });
  });

  it("hebt eine Vormerkung für die bereits laufende Szene auf", () => {
    const transport = new BarQueuedTransport();
    transport.start(1);
    expect(transport.queue(3)).toBe(3);
    expect(transport.queue(1)).toBeNull();
    expect(transport.queuedScene).toBeNull();
  });

  it("spielt mit Szenenfolge jede Szene gleich oft und springt danach weiter", () => {
    const transport = new BarQueuedTransport();
    transport.setChain(2);
    transport.start(0);
    const scenes: number[] = [];
    for (let index = 0; index < 64 * 2 * 4 + 1; index += 1) scenes.push(transport.next().scene);
    expect(scenes.slice(0, 128).every((scene) => scene === 0)).toBe(true);
    expect(scenes.slice(128, 256).every((scene) => scene === 1)).toBe(true);
    expect(scenes.slice(384, 512).every((scene) => scene === 3)).toBe(true);
    expect(scenes[512]).toBe(0);
    expect(transport.chainNext).toBe(1);
  });

  it("zählt Durchläufe und lässt eine manuelle Wahl in der Folge Vorrang haben", () => {
    const transport = new BarQueuedTransport();
    transport.setChain(4);
    transport.start(1);
    for (let index = 0; index < 64; index += 1) transport.next();
    expect(transport.next()).toMatchObject({ scene: 1, pass: 1, bar: 0, step: 0 });
    transport.queue(3);
    for (let index = 0; index < 15; index += 1) transport.next();
    expect(transport.next()).toMatchObject({ scene: 3, pass: 0, switched: true });
    expect(transport.chainNext).toBe(0);
  });

  it("läuft ohne Szenenfolge in derselben Szene weiter", () => {
    const transport = new BarQueuedTransport();
    transport.start(2);
    for (let index = 0; index < 64 * 3; index += 1) transport.next();
    expect(transport.next()).toMatchObject({ scene: 2, pass: 3 });
    expect(transport.chainNext).toBeNull();
  });
});
