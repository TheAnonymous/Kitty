import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { expect, test, type Page } from "@playwright/test";

const axeSource = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");

// axe is injected as a script; the production CSP of the preview would block it.
test.use({ bypassCSP: true, viewport: { width: 1280, height: 800 } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("kitty.tour.v1", "done"));
  await page.goto("./");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

/** Every automatically checkable WCAG 2.2 A/AA rule, colour contrast included. */
async function violations(page: Page): Promise<string[]> {
  await page.addScriptTag({ content: axeSource });
  return page.evaluate(async () => {
    const { axe } = window as unknown as { axe: typeof import("axe-core") };
    const result = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } });
    return result.violations.map((violation) => `${violation.id}: ${violation.nodes.slice(0, 4).map((node) => node.target.join(" ")).join(" | ")}`);
  });
}

test("erfüllt die automatisch prüfbaren WCAG-2.2-AA-Regeln in der Oberfläche", async ({ page }) => {
  expect(await violations(page)).toEqual([]);
  await page.locator('.kitty-step[data-bar="0"][data-step="0"]').click();
  await page.locator('.track-button[data-track="acid"]').click();
  await page.locator('.kitty-step[data-bar="0"][data-step="0"]').click();
  expect(await violations(page)).toEqual([]);
});

test("erfüllt die automatisch prüfbaren WCAG-2.2-AA-Regeln in den Dialogen", async ({ page }) => {
  for (const name of ["Projekte", "Neu", "Hilfe und Tastenkürzel", "Als WAV exportieren"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(await violations(page), name).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
});

test("erfüllt die automatisch prüfbaren WCAG-2.2-AA-Regeln auf der Handy-Seite", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await violations(page)).toEqual([]);
});
