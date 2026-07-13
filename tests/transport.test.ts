import { describe, expect, it } from "vitest";
import { BarQueuedTransport } from "@/audio/transport";

describe("Szenen-Transport", () => {
  it("schaltet vorgemerkte Szenen ausschließlich an der nächsten Taktgrenze", () => {
    const transport = new BarQueuedTransport();
    transport.start(0);
    expect(transport.next()).toEqual({ scene: 0, bar: 0, step: 0, switched: false });
    transport.queue(2);
    for (let step = 1; step < 16; step += 1) expect(transport.next().scene).toBe(0);
    expect(transport.next()).toEqual({ scene: 2, bar: 0, step: 0, switched: true });
  });

  it("hebt eine Vormerkung für die bereits laufende Szene auf", () => {
    const transport = new BarQueuedTransport();
    transport.start(1);
    expect(transport.queue(3)).toBe(3);
    expect(transport.queue(1)).toBeNull();
    expect(transport.queuedScene).toBeNull();
  });
});
