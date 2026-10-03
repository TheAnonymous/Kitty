import { expect, test } from "@playwright/test";

// Runs in Chromium and Firefox: Kitty's reference browser is Chromium, but the
// core path (load, play, stop, export) must not break elsewhere.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("kitty.tour.v1", "done"));
  await page.goto("./");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("lädt ohne Fehler, spielt und stoppt", async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.getByRole("button", { name: /START/ }).click();
  await expect(page.getByRole("button", { name: /STOP/ })).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(".kitty-shell")).toHaveAttribute("data-triggered-tracks", /drums/, { timeout: 10_000 });
  await expect(page.locator(".kitty-step.is-playing")).toHaveCount(1);
  await page.getByRole("button", { name: /STOP/ }).click();
  await expect(page.getByRole("button", { name: /START/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test("exportiert eine Szene als WAV", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.getByRole("button", { name: "4 TAKTE" }).click();
  await page.getByRole("button", { name: "Als WAV exportieren" }).click();
  await page.getByText(/Nur „Aufwärmen“/).click();
  const download = page.waitForEvent("download", { timeout: 100_000 });
  await page.locator("[data-confirm-export]").click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("kitty-hybrid-aufwaermen.wav");
  const path = testInfo.outputPath(file.suggestedFilename());
  await file.saveAs(path);
  const { readFile } = await import("node:fs/promises");
  const wav = await readFile(path);
  expect(wav.subarray(0, 4).toString()).toBe("RIFF");
  expect(wav.readUInt32LE(40) / (44_100 * 2 * 2)).toBeGreaterThanOrEqual(6.4);
  let peak = 0;
  for (let offset = 44; offset < wav.length; offset += 2) peak = Math.max(peak, Math.abs(wav.readInt16LE(offset)));
  expect(peak).toBeGreaterThan(3_000);
});
