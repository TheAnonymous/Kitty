import { expect, test } from "@playwright/test";
import type { OfflineAudioMetrics } from "../apps/kitty/src/audio/engine";

const PRESET_RMS = {
  drums: [-20, -12],
  acid: [-27, -16],
  stab: [-32, -21],
  rave: [-32, -20],
  texture: [-43, -28],
} as const;

test("rendert die vollständige lokale Sound-Polish-Matrix innerhalb aller Analyse-Gates", async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("requestfailed", (request) => errors.push(`Request fehlgeschlagen: ${request.url()}`));
  page.on("request", (request) => {
    if (new URL(request.url()).origin !== "http://127.0.0.1:4173") errors.push(`Externer Request: ${request.url()}`);
  });
  await page.goto("./?audio-test=1");
  await expect(page.locator("html")).toHaveAttribute("data-audio-test", "ready");
  const suite = await page.evaluate(() => window.__kittyAudioTest!.renderSuite());

  expect(Object.keys(suite.presets)).toHaveLength(15);
  expect(Object.keys(suite.factories).sort()).toEqual([
    "acid:120", "acid:150", "acid:180", "hard:120", "hard:150", "hard:180", "hybrid:120", "hybrid:150", "hybrid:180",
  ]);
  expect(Object.keys(suite.stresses).sort()).toEqual(["acid", "hard", "hybrid"]);

  for (const [name, renders] of Object.entries(suite.presets)) {
    const track = name.split(":")[0] as keyof typeof PRESET_RMS;
    expect(Object.keys(renders).sort(), `${name}: Makrostufen`).toEqual(["max", "mid", "min"]);
    for (const [level, metrics] of Object.entries(renders)) assertSafety(`${name}@${level}`, metrics);
    const [minimumRms, maximumRms] = PRESET_RMS[track];
    expect(renders.mid.rmsDb, `${name}: mittlerer RMS`).toBeGreaterThanOrEqual(minimumRms);
    expect(renders.mid.rmsDb, `${name}: mittlerer RMS`).toBeLessThanOrEqual(maximumRms);
    for (const level of ["min", "max"] as const) {
      expect(renders[level].rmsDb, `${name}@${level}: nicht mehr als 10 dB leiser`).toBeGreaterThanOrEqual(renders.mid.rmsDb - 10);
      expect(renders[level].rmsDb, `${name}@${level}: nicht mehr als 6 dB lauter`).toBeLessThanOrEqual(renders.mid.rmsDb + 6);
    }
    if (track === "stab" || track === "rave" || track === "texture") {
      expect.soft(renders.mid.highSideDb, `${name}: obere Seitenenergie`).toBeGreaterThanOrEqual(-24);
      expect.soft(renders.mid.highSideDb, `${name}: obere Seitenenergie`).toBeLessThanOrEqual(3);
    } else {
      for (const [level, metrics] of Object.entries(renders)) expect(metrics.lowSideDb, `${name}@${level}: Low-End mono`).toBeLessThanOrEqual(-24);
    }
  }

  for (const [name, metrics] of Object.entries(suite.factories)) {
    assertSafety(name, metrics);
    expect(metrics.rmsDb, `${name}: RMS`).toBeGreaterThanOrEqual(-18);
    expect(metrics.rmsDb, `${name}: RMS`).toBeLessThanOrEqual(-11);
    expect(metrics.crestDb, `${name}: Crest`).toBeGreaterThanOrEqual(8);
    expect(metrics.crestDb, `${name}: Crest`).toBeLessThanOrEqual(15);
    expect(metrics.nearCeilingRatio, `${name}: Limiter-Pinning`).toBeLessThan(0.005);
    expect(metrics.lowSideDb, `${name}: Low-End mono`).toBeLessThanOrEqual(-18);
  }
  for (const [name, metrics] of Object.entries(suite.stresses)) {
    assertSafety(`${name}:stress`, metrics);
    expect(metrics.nearCeilingRatio, `${name}:stress: Limiter-Pinning`).toBeLessThan(0.005);
    expect(metrics.lowSideDb, `${name}:stress: Low-End mono`).toBeLessThanOrEqual(-18);
  }

  for (const track of ["drums", "acid", "stab", "rave", "texture"] as const) {
    const signatures = Object.entries(suite.presets).filter(([name]) => name.startsWith(`${track}:`)).map(([name, renders]) => ({ name, metrics: renders.mid }));
    expect(signatures).toHaveLength(3);
    for (let left = 0; left < signatures.length; left += 1) {
      for (let right = left + 1; right < signatures.length; right += 1) {
        const a = signatures[left]!;
        const b = signatures[right]!;
        const loudness = Math.abs(a.metrics.rmsDb - b.metrics.rmsDb) >= 1.5 || Math.abs(a.metrics.crestDb - b.metrics.crestDb) >= 1.5;
        const aLowMid = a.metrics.bandDb.low - a.metrics.bandDb.mid;
        const bLowMid = b.metrics.bandDb.low - b.metrics.bandDb.mid;
        const aHighMid = a.metrics.bandDb.high - a.metrics.bandDb.mid;
        const bHighMid = b.metrics.bandDb.high - b.metrics.bandDb.mid;
        const tonal = Math.abs(aLowMid - bLowMid) >= 2 || Math.abs(aHighMid - bHighMid) >= 2;
        const stereo = Math.abs(a.metrics.sideDb - b.metrics.sideDb) >= 3;
        expect.soft([loudness, tonal, stereo].filter(Boolean).length, `${a.name}/${b.name}: mindestens zwei klare Merkmale`).toBeGreaterThanOrEqual(2);
      }
    }
  }
  expect(errors).toEqual([]);
});

test("stellt den Offline-Testpfad ohne Query nicht bereit", async ({ page }) => {
  await page.goto("./");
  expect(await page.evaluate(() => window.__kittyAudioTest)).toBeUndefined();
  await expect(page.locator("html")).not.toHaveAttribute("data-audio-test", "ready");
});

function assertSafety(name: string, metrics: OfflineAudioMetrics): void {
  expect(metrics.finite, `${name}: endliche Samples`).toBe(true);
  expect(metrics.dcOffset, `${name}: DC`).toBeLessThan(0.003);
  expect(metrics.peakDb, `${name}: Peak`).toBeLessThanOrEqual(-0.8);
  expect(Number.isFinite(metrics.activeRmsDb), `${name}: aktive Lautheit`).toBe(true);
  expect(Number.isFinite(metrics.tailEnergyDb), `${name}: Tail-Energie`).toBe(true);
  expect(metrics.stereoCorrelation, `${name}: Stereokorrelation`).toBeGreaterThanOrEqual(-1);
  expect(metrics.stereoCorrelation, `${name}: Stereokorrelation`).toBeLessThanOrEqual(1);
}
