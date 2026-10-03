import { expect, test as base } from "@playwright/test";

// Chromium can retain released Web Audio render resources for the lifetime of a
// process. A fresh browser per live test keeps transport assertions independent.
const test = base.extend({
  page: async ({ playwright }, use, testInfo) => {
    const browser = await playwright.chromium.launch();
    const context = await browser.newContext({
      baseURL: String(testInfo.project.use.baseURL),
      viewport: { width: 1_280, height: 720 },
    });
    const page = await context.newPage();
    await use(page);
    await browser.close();
  },
});

test.beforeEach(async ({ page }) => {
  // The first-visit tour has its own test; everywhere else it would cover the controls.
  await page.addInitScript(() => localStorage.setItem("kitty.tour.v1", "done"));
  await page.goto("./");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("lädt vollständig lokal und startet alle fünf hörbaren Spuren nach Nutzeraktion", async ({ page }) => {
  test.setTimeout(70_000);
  const errors: string[] = [];
  const external: string[] = [];
  page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("requestfailed", (request) => errors.push(`Request fehlgeschlagen: ${request.url()}`));
  page.on("response", (response) => { if (response.status() >= 400) errors.push(`${response.status()}: ${response.url()}`); });
  page.on("request", (request) => { if (new URL(request.url()).origin !== "http://127.0.0.1:4173") external.push(request.url()); });

  await expect(page.getByRole("heading", { name: "KITTY" })).toBeVisible();
  await expect(page.locator(".kitty-step")).toHaveCount(64);
  await expect(page.locator(".scene-pad")).toHaveCount(4);
  await expect(page.locator(".mixer-channel")).toHaveCount(5);
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", "/Kitty/favicon.svg");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", "/Kitty/apple-touch-icon.png");
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", "https://musik.jodie-oesterling.de/Kitty/kitty-social.jpg");
  await page.getByRole("button", { name: /START/ }).click();
  await expect(page.getByRole("button", { name: /STOP/ })).toBeVisible({ timeout: 10_000 });

  await expect.poll(async () => (await page.locator(".kitty-shell").getAttribute("data-triggered-tracks"))?.split(",").sort(), { timeout: 20_000 })
    .toEqual(["acid", "drums", "rave", "stab", "texture"]);
  await expect.poll(async () => Number(await page.getByRole("meter", { name: "Pegel Drum Machine" }).getAttribute("aria-valuenow")), { timeout: 20_000 }).toBeGreaterThan(0);
  await expect.poll(async () => Number(await page.getByRole("meter", { name: "Masterpegel" }).getAttribute("aria-valuenow")), { timeout: 20_000 }).toBeGreaterThan(0);
  await expect.poll(async () => page.locator(".kitty-shell").getAttribute("data-audio-ducking"), { timeout: 20_000 }).toBe("active");
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test("führt einen direkt benachbarten Acid-Slide ohne neuen Attack aus", async ({ page }) => {
  test.setTimeout(50_000);
  await page.locator('.track-button[data-track="acid"]').click();
  await page.locator('.kitty-step[data-bar="0"][data-step="1"]').click();
  const slide = page.getByRole("switch", { name: /SLIDE/ });
  if (await slide.getAttribute("aria-checked") !== "true") await slide.click();
  await expect(slide).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: /START/ }).click();
  await expect(page.getByRole("button", { name: /STOP/ })).toBeVisible({ timeout: 10_000 });
  await expect.poll(async () => page.locator(".kitty-shell").getAttribute("data-acid-legato"), { timeout: 30_000 }).toBe("active");
});

test("stresst schnelle Preset-Wechsel in drei parallelen Audio-Kontexten", async ({ browser }, testInfo) => {
  test.setTimeout(120_000);
  const pages = await Promise.all(Array.from({ length: 3 }, async () => {
    const page = await browser.newPage();
    await page.goto(String(testInfo.project.use.baseURL));
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    return page;
  }));
  const failures: string[] = [];
  await Promise.all(pages.map(async (page, pageIndex) => {
    page.on("pageerror", (error) => failures.push(`Seite ${pageIndex + 1}: ${error.message}`));
    page.on("console", (message) => { if (message.type() === "error") failures.push(`Seite ${pageIndex + 1}: ${message.text()}`); });
    await page.getByRole("button", { name: /START/ }).click();
    await expect(page.getByRole("button", { name: /STOP/ })).toBeVisible({ timeout: 10_000 });
    for (let round = 0; round < 3; round += 1) {
      for (const track of ["drums", "acid", "stab", "rave", "texture"] as const) {
        await page.locator(`.track-button[data-track="${track}"]`).click({ force: true });
        await page.locator(".preset-button").evaluateAll((buttons) => buttons.forEach((button) => (button as HTMLButtonElement).click()));
      }
    }
    await page.waitForTimeout(800);
    await expect(page.getByRole("button", { name: /STOP/ })).toBeVisible();
    await expect(page.getByRole("alert", { name: /Audio braucht deine Hilfe/ })).toHaveCount(0);
  }));
  await Promise.all(pages.map((page) => page.close()));
  expect(failures).toEqual([]);
});

test("wechselt bei laufendem Transport durch alle 15 Presets ohne Audiofehler", async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("requestfailed", (request) => errors.push(`Request fehlgeschlagen: ${request.url()}`));

  await page.getByRole("button", { name: /START/ }).click();
  await expect(page.getByRole("button", { name: /STOP/ })).toBeVisible({ timeout: 10_000 });
  const tracks = [
    { id: "drums", name: "Drum Machine", presets: ["Warehouse", "Stahl", "Rumble"] },
    { id: "acid", name: "Acid Bass", presets: ["Silverbox", "Venom", "Rubber"] },
    { id: "stab", name: "Stab", presets: ["Beton", "Chord", "Flash"] },
    { id: "rave", name: "Rave Lead", presets: ["Hoover", "Pulse", "Siren"] },
    { id: "texture", name: "Texture / FX", presets: ["Noise", "Drone", "Riser"] },
  ] as const;

  for (const track of tracks) {
    await page.locator(`.track-button[data-track="${track.id}"]`).click({ force: true });
    for (const label of track.presets) {
      const button = page.locator(".preset-button").filter({ has: page.locator("strong").filter({ hasText: label }) });
      await button.click({ force: true });
      await expect(button).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByRole("button", { name: /STOP/ })).toBeVisible();
    }
    const meter = page.getByRole("meter", { name: `Pegel ${track.name}` });
    await expect(meter).toHaveAttribute("aria-valuenow", /^\d+$/);
  }

  await expect.poll(async () => (await page.locator(".kitty-shell").getAttribute("data-triggered-tracks"))?.split(",").sort(), { timeout: 8_000 })
    .toEqual(["acid", "drums", "rave", "stab", "texture"]);
  await expect(page.getByRole("alert", { name: /Audio braucht deine Hilfe/ })).toHaveCount(0);
  expect(errors).toEqual([]);
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
  test.setTimeout(60_000);
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

test("sichert ein Projekt als Datei und öffnet es als neues Projekt", async ({ page }, testInfo) => {
  await page.getByRole("button", { name: "Projekte" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Als Datei sichern" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("kitty-hybrid.kitty.json");
  const path = testInfo.outputPath(file.suggestedFilename());
  await file.saveAs(path);
  await page.locator("[data-import-input]").setInputFiles(path);
  await expect(page.locator(".project-name")).toHaveText("Kitty Hybrid");
  await page.getByRole("button", { name: "Projekte" }).click();
  await expect(page.locator(".project-list button")).toHaveCount(2);
});

test("spielt die Szenenfolge und exportiert eine Szene als WAV", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const chain = page.getByRole("switch", { name: "Szenenfolge" });
  await expect(chain).toHaveAttribute("aria-checked", "false");
  await page.getByRole("button", { name: "4 TAKTE" }).click();
  await expect(page.getByRole("button", { name: "4 TAKTE" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".arrangement-hint")).toHaveText("je Szene · ganzer Bogen 0:26 min");
  await chain.click();
  await expect(chain).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: /START/ }).click();
  await expect(page.locator(".transport-readout")).toContainText("Szenenfolge · Aufwärmen 1/1 → Druck", { timeout: 10_000 });
  await expect(page.locator('.scene-pad[data-scene="1"] small')).toHaveText("DANACH");
  await page.getByRole("button", { name: /STOP/ }).click();

  await page.getByRole("button", { name: "Als WAV exportieren" }).click();
  await page.getByText(/Nur „Aufwärmen“/).click();
  await expect(page.getByRole("radio", { name: /Nur „Aufwärmen“/ })).toBeChecked();
  const download = page.waitForEvent("download", { timeout: 60_000 });
  await page.locator("[data-confirm-export]").click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("kitty-hybrid-aufwaermen.wav");
  const path = testInfo.outputPath(file.suggestedFilename());
  await file.saveAs(path);
  const { readFileSync } = await import("node:fs");
  const wav = readFileSync(path);
  expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
  expect(wav.toString("ascii", 8, 12)).toBe("WAVE");
  const seconds = wav.readUInt32LE(40) / (44_100 * 2 * 2);
  expect(seconds).toBeGreaterThanOrEqual(6.4);
  expect(seconds).toBeLessThanOrEqual(6.4 + 5);
  let peak = 0;
  for (let offset = 44; offset < wav.length; offset += 2) peak = Math.max(peak, Math.abs(wav.readInt16LE(offset)));
  expect(peak).toBeGreaterThan(3_000);
  expect(peak).toBeLessThan(32_767);
  await expect(page.getByRole("dialog", { name: "Als WAV exportieren" })).toHaveCount(0);
});

test("teilt ein Projekt als Link und übernimmt es als neues Projekt", async ({ page }) => {
  await page.getByRole("button", { name: "8 TAKTE" }).click();
  await page.getByRole("button", { name: "16 TAKTE" }).click();
  await page.getByRole("button", { name: "Link teilen" }).click();
  const input = page.locator("input[data-share-url]");
  await expect(input).toHaveValue(/\/Kitty\/#p=1\.[A-Za-z0-9_-]+$/);
  const url = await input.inputValue();
  await page.getByRole("button", { name: "Fertig" }).click();

  const receiver = await page.context().newPage();
  await receiver.goto(url);
  const offer = receiver.getByRole("dialog", { name: "Geteiltes Projekt öffnen?" });
  await expect(offer).toContainText("„Kitty Hybrid“");
  await offer.getByRole("button", { name: "Als neues Projekt übernehmen" }).click();
  await expect(receiver.locator(".kv-toast")).toContainText("Geteiltes Projekt übernommen");
  await expect(receiver.locator(".project-name")).toHaveText("Kitty Hybrid");
  await expect(receiver.getByRole("button", { name: "16 TAKTE" })).toHaveAttribute("aria-pressed", "true");
  expect(new URL(receiver.url()).hash).toBe("");
  await receiver.getByRole("button", { name: "Projekte" }).click();
  await expect(receiver.locator(".project-list button")).toHaveCount(2);
});

test("führt beim ersten Besuch durch vier Stationen und lässt sich wieder aufrufen", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(String(baseURL));
  await expect(page.getByRole("dialog", { name: "Start und Stop" })).toBeVisible();
  await expect(page.locator(".kitty-tour__count")).toHaveText("1 / 4");
  await page.getByRole("button", { name: "Weiter" }).click();
  await expect(page.getByRole("dialog", { name: "Vier Szenen" })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Spuren und Steps" })).toBeVisible();
  await page.getByRole("button", { name: "Weiter" }).click();
  await page.getByRole("button", { name: "Los geht's" }).click();
  await expect(page.locator(".kitty-tour")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: /START/ })).toBeVisible();
  await expect(page.locator(".kitty-tour")).toHaveCount(0);

  await page.locator("body").press("?");
  const help = page.getByRole("dialog", { name: "Hilfe und Tastenkürzel" });
  await expect(help).toContainText("Szene wählen");
  await help.getByRole("button", { name: "Tour starten" }).click();
  await expect(page.locator(".kitty-tour__count")).toHaveText("1 / 4");
  await page.keyboard.press("Escape");
  await expect(page.locator(".kitty-tour")).toHaveCount(0);
  await context.close();
});

test("folgt MIDI-Clock und Reglern eines Controllers", async ({ page }) => {
  await page.addInitScript(() => {
    const listeners: ((event: { data: Uint8Array; timeStamp: number }) => void)[] = [];
    const input = {
      name: "Test-Controller",
      state: "connected",
      set onmidimessage(handler: (event: { data: Uint8Array; timeStamp: number }) => void) { listeners.splice(0, listeners.length, handler); },
    };
    const access = { inputs: new Map([["in-1", input]]), onstatechange: null };
    Object.defineProperty(navigator, "requestMIDIAccess", { configurable: true, value: async () => access });
    (window as unknown as { __midi(bytes: number[], timeStamp?: number): void }).__midi = (bytes, timeStamp = performance.now()) => {
      for (const listener of listeners) listener({ data: new Uint8Array(bytes), timeStamp });
    };
  });
  await page.reload();
  const send = (bytes: number[]) => page.evaluate((data) => (window as unknown as { __midi(bytes: number[]): void }).__midi(data), bytes);

  await page.getByRole("button", { name: "MIDI", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "MIDI" });
  await dialog.getByRole("button", { name: "MIDI verbinden" }).click();
  await expect(dialog).toContainText("Test-Controller");
  await expect(page.locator(".midi-led")).toHaveAttribute("data-state", "ready");

  for (const value of [20, 60, 100, 127]) await send([0xb0, 71, value]);
  const pressure = page.getByLabel("Druck", { exact: true });
  await expect(pressure).toHaveValue("1");
  await dialog.getByRole("button", { name: "Fertig" }).click();
  await page.getByRole("button", { name: /Undo/ }).click();
  await expect(pressure).toHaveValue("0.76");
  await expect(page.getByRole("button", { name: /Undo/ })).toBeDisabled();

  await page.getByRole("button", { name: "MIDI", exact: true }).click();
  await dialog.getByRole("button", { name: "Zuweisen" }).first().click();
  await expect(dialog).toContainText("Dreh jetzt einen Regler");
  await send([0xb2, 21, 0]);
  await expect(dialog.locator(".midi-map li").first()).toContainText("CC 21");

  const interval = 60_000 / 143 / 24;
  await page.evaluate((step) => {
    const midi = (window as unknown as { __midi(bytes: number[], timeStamp?: number): void }).__midi;
    for (let tick = 0; tick <= 48; tick += 1) midi([0xf8], tick * step);
  }, interval);
  await expect(dialog.locator(".midi-clock")).toHaveText("Clock: 143 BPM");
  await expect(page.locator(".transport-readout")).toContainText("MIDI-Clock · 143 BPM");
  await expect(dialog.locator(".midi-clock")).toContainText("Keine Clock", { timeout: 3_000 });
});

test("hält den Bildschirm wach, solange Musik läuft", async ({ page }) => {
  await page.addInitScript(() => {
    const calls: string[] = [];
    (window as unknown as { __wakeCalls: string[] }).__wakeCalls = calls;
    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: { request: async (type: string) => { calls.push(`request:${type}`); return Object.assign(new EventTarget(), { release: async () => { calls.push("release"); } }); } },
    });
  });
  await page.reload();
  await page.getByRole("button", { name: /START/ }).click();
  await expect(page.getByRole("button", { name: /STOP/ })).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => page.evaluate(() => (window as unknown as { __wakeCalls: string[] }).__wakeCalls)).toEqual(["request:screen"]);
  await page.getByRole("button", { name: /STOP/ }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __wakeCalls: string[] }).__wakeCalls)).toEqual(["request:screen", "release"]);
});

test("macht aus einem Reglerzug einen einzigen Undo-Schritt", async ({ page }) => {
  const swing = page.getByLabel("Swing");
  await swing.focus();
  for (let press = 0; press < 5; press += 1) await swing.press("ArrowRight");
  await expect(swing).toHaveValue("0.13");
  await page.getByRole("button", { name: /Undo/ }).click();
  await expect(swing).toHaveValue("0.08");
  await expect(page.getByRole("button", { name: /Undo/ })).toBeDisabled();
});

test("nimmt das Live-Spiel als WAV auf", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await page.locator("body").press("a");
  // The record button says "Aufnahme stoppen" by now as well.
  await expect(page.getByRole("button", { name: /■ STOP/ })).toBeVisible({ timeout: 10_000 });
  const record = page.locator(".live-record");
  await expect(record).toHaveAttribute("aria-pressed", "true");
  await expect(record.locator("output")).not.toHaveText("0:00", { timeout: 5_000 });
  await page.waitForTimeout(1_500);
  const download = page.waitForEvent("download");
  await page.locator("body").press("a");
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^kitty-hybrid-live-\d{4}-\d{2}-\d{2}-\d{4}\.wav$/);
  const path = testInfo.outputPath("live.wav");
  await file.saveAs(path);
  const { readFile } = await import("node:fs/promises");
  const wav = await readFile(path);
  expect(wav.subarray(0, 4).toString()).toBe("RIFF");
  expect(wav.readUInt32LE(40) / (wav.readUInt32LE(24) * 4)).toBeGreaterThan(1.5);
  let peak = 0;
  for (let offset = 44; offset < wav.length; offset += 2) peak = Math.max(peak, Math.abs(wav.readInt16LE(offset)));
  expect(peak).toBeGreaterThan(2_000);
  await expect(page.locator(".kv-toast")).toContainText("Aufnahme gespeichert");
});

test("schaltet Spuren am Takt stumm und spielt Break, Drop und Filter", async ({ page }) => {
  test.setTimeout(60_000);
  await page.getByRole("button", { name: /START/ }).click();
  await expect(page.getByRole("button", { name: /STOP/ })).toBeVisible({ timeout: 10_000 });
  await page.locator("body").press("p");
  await expect(page.locator(".live-keys")).toHaveAttribute("aria-pressed", "true");
  await page.locator("body").press("2");
  const acid = page.locator('.live-mute[data-track="acid"]');
  await expect(acid).toHaveAttribute("data-pending", "");
  await expect(acid).toHaveAttribute("aria-pressed", "true", { timeout: 6_000 });
  await expect(acid).not.toHaveAttribute("data-pending", "");

  const breakButton = page.locator("[data-perf-break]");
  await page.keyboard.down("b");
  await expect(breakButton).toHaveAttribute("data-state", "break");
  await page.keyboard.up("b");
  await expect(breakButton).toHaveAttribute("data-state", "drop");
  await expect(breakButton).toHaveAttribute("data-state", "idle", { timeout: 6_000 });

  const filter = page.locator("[data-perf-filter]");
  await page.keyboard.down("f");
  await expect.poll(async () => Number(await filter.inputValue())).toBeLessThan(-30);
  await page.keyboard.up("f");
  await expect(filter).toHaveValue("0");

  await page.getByRole("button", { name: /STOP/ }).click();
  await expect(acid).toHaveAttribute("aria-pressed", "false");
});

test("exportiert jede Spur einzeln als Stems-ZIP", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.getByRole("button", { name: "4 TAKTE" }).click();
  await page.getByRole("button", { name: "Als WAV exportieren" }).click();
  await page.getByText(/Nur „Aufwärmen“/).click();
  await page.getByText("Spuren einzeln (Stems)").click();
  const download = page.waitForEvent("download", { timeout: 100_000 });
  await page.locator("[data-confirm-export]").click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("kitty-hybrid-aufwaermen-stems.zip");
  const path = testInfo.outputPath(file.suggestedFilename());
  await file.saveAs(path);
  const { readFile } = await import("node:fs/promises");
  const zip = await readFile(path);
  expect(zip.readUInt32LE(0)).toBe(0x04034b50);
  const names = zip.toString("latin1");
  expect(names).toContain("01-drums.wav");
  expect(names).toContain("02-acid.wav");
  expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50);
  expect(zip.readUInt16LE(zip.length - 12)).toBeGreaterThanOrEqual(3);
});

test("startet und stoppt zwei gekoppelte Tabs im Gleichtakt", async ({ page }) => {
  test.setTimeout(60_000);
  const partner = await page.context().newPage();
  await partner.goto("./");
  for (const tab of [page, partner]) {
    await tab.getByRole("button", { name: "GLEICHTAKT" }).click();
    await expect(tab.getByRole("button", { name: "GLEICHTAKT" })).toHaveAttribute("aria-pressed", "true");
  }
  await expect(page.locator(".link-led")).toHaveAttribute("data-state", "linked");
  await expect(partner.locator(".link-led")).toHaveAttribute("data-state", "linked");

  await page.getByRole("button", { name: /START/ }).click();
  await expect(partner.getByRole("button", { name: /STOP/ })).toBeVisible({ timeout: 10_000 });
  await expect(partner.locator(".transport-readout")).toContainText("Gleichtakt mit Kitty · 150 BPM");
  await page.getByRole("button", { name: /STOP/ }).click();
  await expect(partner.getByRole("button", { name: /START/ })).toBeVisible({ timeout: 5_000 });

  await partner.getByRole("button", { name: "GLEICHTAKT" }).click();
  await expect(page.locator(".link-led")).toHaveAttribute("data-state", "waiting");
  await partner.close();
});

test("declares its sound as playback on Apple devices, so the ring/silent switch does not mute it", async ({ page }) => {
  // Safari's audio session (iOS 17+); Chromium has none, so the test gives the page one.
  await page.addInitScript(() => { Object.defineProperty(navigator, "audioSession", { value: { type: "auto" }, configurable: true }); });
  await page.reload();
  const sessionType = () => page.evaluate(() => (navigator as Navigator & { audioSession: { type: string } }).audioSession.type);
  expect(await sessionType()).toBe("auto");
  await page.getByRole("button", { name: /START/ }).click();
  await expect(page.getByRole("button", { name: /STOP/ })).toBeVisible({ timeout: 10_000 });
  expect(await sessionType()).toBe("playback");
});
