import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("lädt vollständig lokal und startet alle fünf hörbaren Spuren nach Nutzeraktion", async ({ page }) => {
  const errors: string[] = [];
  const external: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("requestfailed", (request) => errors.push(`Request fehlgeschlagen: ${request.url()}`));
  page.on("response", (response) => { if (response.status() >= 400) errors.push(`${response.status()}: ${response.url()}`); });
  page.on("request", (request) => { if (new URL(request.url()).origin !== "http://127.0.0.1:4173") external.push(request.url()); });

  await expect(page.getByRole("heading", { name: "KITTY" })).toBeVisible();
  await expect(page.locator(".kitty-step")).toHaveCount(64);
  await expect(page.locator(".scene-pad")).toHaveCount(4);
  await expect(page.locator(".mixer-channel")).toHaveCount(5);
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", "/Kitty/favicon.svg");
  await page.getByRole("button", { name: /START/ }).click();
  await expect(page.getByRole("button", { name: /STOP/ })).toBeVisible({ timeout: 10_000 });

  await expect.poll(async () => (await page.locator(".kitty-shell").getAttribute("data-triggered-tracks"))?.split(",").sort(), { timeout: 8_000 })
    .toEqual(["acid", "drums", "rave", "stab", "texture"]);
  await expect(page.getByRole("meter", { name: "Pegel Drum Machine" })).toHaveAttribute("aria-valuenow", /\d+/);
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test("merkt Szenen an der nächsten Taktgrenze vor", async ({ page }) => {
  await page.getByRole("button", { name: /START/ }).click();
  await expect(page.getByRole("button", { name: /STOP/ })).toBeVisible({ timeout: 10_000 });
  const peak = page.locator('.scene-pad[data-scene="3"]');
  await peak.click();
  await expect(peak).toHaveClass(/is-queued/);
  await expect(page.locator(".transport-readout")).toContainText("Szene 4 startet am nächsten Takt");
});

test("wählt belegte Steps ohne Typänderung und schaltet sie ausdrücklich aus", async ({ page }) => {
  const existing = page.locator('.kitty-step[data-bar="0"][data-step="0"]');
  const label = await existing.getAttribute("aria-label");

  await existing.click();

  await expect(existing).toHaveClass(/is-selected/);
  await expect(existing).toHaveAttribute("aria-label", label!);
  await page.getByRole("button", { name: "Step ausschalten" }).click();
  await expect(existing).toHaveAttribute("aria-label", /aus$/);
});

test("speichert Steps automatisch und rekonstruiert sie nach Reload", async ({ page }) => {
  const step = page.locator('.kitty-step[data-bar="0"][data-step="1"]');
  await step.click();
  await expect(step).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("[data-save-status]")).toContainText("gespeichert");
  await page.reload();
  await expect(page.locator('.kitty-step[data-bar="0"][data-step="1"]')).toHaveAttribute("aria-selected", "true");
});

test("erstellt bestätigte Profile, wechselt Projekte und löscht die Undo-Historie beim Wechsel", async ({ page }) => {
  await page.locator('.kitty-step[data-bar="0"][data-step="1"]').click();
  await expect(page.getByRole("button", { name: /Undo/ })).toBeEnabled();
  await page.getByRole("button", { name: "Neu" }).click();
  await expect(page.getByRole("dialog", { name: "Neues Werkprojekt" })).toBeVisible();
  await page.getByText(/^Hard —/).click();
  await page.getByLabel("Projektname").fill("Dunkler Keller");
  await page.getByRole("button", { name: "Hard erstellen" }).click();
  await expect(page.locator(".project-name")).toHaveText("Dunkler Keller");
  await expect(page.getByRole("button", { name: /Undo/ })).toBeDisabled();
  await expect(page.getByText("155 BPM", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /START/ }).click();
  await expect(page.getByRole("button", { name: /STOP/ })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Projekte" }).click();
  await expect(page.getByRole("dialog", { name: "Lokale Projekte" })).toBeVisible();
  await page.getByRole("button", { name: /Kitty Hybrid/ }).click();
  await expect(page.locator(".project-name")).toHaveText("Kitty Hybrid");
  await expect(page.getByRole("button", { name: /Undo/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: /START/ })).toBeVisible();
});

test("fällt bei beschädigtem Primärprojekt auf die letzte gültige Sicherung zurück", async ({ page }) => {
  await page.locator('.kitty-step[data-bar="0"][data-step="1"]').click();
  await expect(page.locator("[data-save-status]")).toContainText("gespeichert");
  await page.evaluate(() => {
    const catalog = JSON.parse(localStorage.getItem("kitty.projects.v1")!);
    localStorage.setItem(`kitty.project.v1.${catalog.activeId}`, "{nicht-json");
  });
  await page.reload();
  await expect(page.locator(".kv-toast")).toContainText("Sicherung", { timeout: 5_000 });
  await expect(page.getByRole("heading", { name: "KITTY" })).toBeVisible();
});

test("bedient Spuren, Szenen, Variation und Undo per Tastatur", async ({ page }) => {
  await page.keyboard.press("5");
  await expect(page.getByRole("heading", { name: "Texture / FX" })).toBeVisible();
  await page.keyboard.press("Shift+4");
  await expect(page.locator('.scene-pad[data-scene="3"]')).toHaveClass(/is-selected/);
  const before = await page.locator('.kitty-step[data-bar="0"][data-step="1"]').getAttribute("class");
  await page.keyboard.press("v");
  await expect(page.getByRole("button", { name: /Undo/ })).toBeEnabled();
  await page.keyboard.press("Control+z");
  expect(await page.locator('.kitty-step[data-bar="0"][data-step="1"]').getAttribute("class")).toBe(before);
  await page.keyboard.press("r");
  await expect(page.getByRole("button", { name: /Undo/ })).toBeEnabled();
});
