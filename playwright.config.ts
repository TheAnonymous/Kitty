import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.015 } },
  use: {
    baseURL: "http://127.0.0.1:4173/Kitty/",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run preview --workspace=@kitty/app -- --host 127.0.0.1",
    port: 4173,
    reuseExistingServer: false,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
