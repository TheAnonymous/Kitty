import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("bleibt auf Laptops mit wenig Höhe vollständig bedienbar", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 657 });
  await expect(page.locator(".kitty-shell")).toBeVisible();
  await expect(page.locator(".desktop-gate")).toBeHidden();
  await expect(page.getByRole("link", { name: /Musik-Werkstatt/ })).toHaveAttribute("href", "/");
  await expect(page.getByRole("button", { name: /START/ })).toBeInViewport();
  await page.locator(".mixer").scrollIntoViewIfNeeded();
  await expect(page.locator(".mixer")).toBeInViewport();
  await expect(page.getByRole("button", { name: /START/ })).toBeInViewport();
});

test("zeigt unterhalb der Mindestbreite eine Handy-Seite mit Rückweg", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { name: "Kitty", exact: true })).toBeVisible();
  await expect(page.locator(".kitty-shell")).toBeHidden();
  await expect(page.getByRole("link", { name: "Zur Musik-Werkstatt" })).toHaveAttribute("href", "/");
  await expect(page.getByRole("button", { name: "Link für später merken" })).toBeVisible();
  const demo = page.locator("figure audio");
  await expect(demo).toBeVisible();
  for (const source of await demo.locator("source").all()) {
    const response = await page.request.get(String(await source.evaluate((element: HTMLSourceElement) => element.src)));
    expect(response.ok()).toBe(true);
    expect((await response.body()).byteLength).toBeGreaterThan(100_000);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
