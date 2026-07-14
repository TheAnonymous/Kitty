import { expect, test } from "@playwright/test";

test("rendert und analysiert alle Presets und Factory-Mixe ausschließlich lokal", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("./?audio-test=1");
  await expect(page.locator("html")).toHaveAttribute("data-audio-test", "ready");
  const suite = await page.evaluate(() => window.__kittyAudioTest!.renderSuite());

  expect(Object.keys(suite.presets)).toHaveLength(15);
  expect(Object.keys(suite.factories).sort()).toEqual(["acid", "hard", "hybrid"]);
  for (const [name, metrics] of Object.entries(suite.presets)) {
    expect(metrics.finite, `${name}: endliche Samples`).toBe(true);
    expect(metrics.dcOffset, `${name}: DC`).toBeLessThan(0.005);
    expect(metrics.peakDb, `${name}: Peak`).toBeLessThanOrEqual(-0.8);
    expect(metrics.rmsDb, `${name}: hörbar`).toBeGreaterThan(-52);
    if (/^(stab|rave|texture):/.test(name)) expect(metrics.highSideDb, `${name}: obere Stereobreite`).toBeGreaterThan(-42);
  }
  for (const [name, metrics] of Object.entries(suite.factories)) {
    expect(metrics.finite, `${name}: endliche Samples`).toBe(true);
    expect(metrics.dcOffset, `${name}: DC`).toBeLessThan(0.005);
    expect(metrics.peakDb, `${name}: Peak`).toBeLessThanOrEqual(-0.8);
    expect(metrics.rmsDb, `${name}: RMS`).toBeGreaterThanOrEqual(-18);
    expect(metrics.rmsDb, `${name}: RMS`).toBeLessThanOrEqual(-10);
    expect(metrics.crestDb, `${name}: Crest`).toBeGreaterThanOrEqual(4.5);
    expect(metrics.nearCeilingRatio, `${name}: Limiter-Pinning`).toBeLessThan(0.01);
    expect(metrics.lowSideDb, `${name}: Low-End mono`).toBeLessThanOrEqual(-15);
  }
  for (const track of ["drums", "acid", "stab", "rave", "texture"] as const) {
    const signatures = Object.entries(suite.presets).filter(([name]) => name.startsWith(`${track}:`)).map(([, metrics]) => [metrics.rmsDb, metrics.crestDb, metrics.bandDb.low, metrics.bandDb.mid, metrics.bandDb.high, metrics.sideDb]);
    expect(signatures).toHaveLength(3);
    for (let left = 0; left < signatures.length; left += 1) {
      for (let right = left + 1; right < signatures.length; right += 1) {
        const distance = Math.sqrt(signatures[left]!.reduce((sum, value, index) => sum + Math.pow(value - signatures[right]![index]!, 2), 0));
        expect(distance, `${track}: Presets ${left + 1}/${right + 1} unterscheidbar`).toBeGreaterThan(0.75);
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
