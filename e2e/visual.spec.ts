import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("visueller Desktop bei 1440 × 900", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page).toHaveScreenshot("kitty-1440.png", { animations: "disabled" });
});

test("visueller Mindest-Desktop bei 1024 × 720", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 720 });
  await expect(page).toHaveScreenshot("kitty-1024.png", { animations: "disabled" });
});
