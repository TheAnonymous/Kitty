import { defineConfig, devices } from "@playwright/test";

const e2ePort = Number.parseInt(process.env.KITTY_E2E_PORT ?? "4173", 10);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.015 } },
  use: {
    baseURL: `http://127.0.0.1:${e2ePort}/Kitty/`,
    trace: "on-first-retry",
  },
  webServer: {
    command: `npm run preview --workspace=@kitty/app -- --host 127.0.0.1 --port ${e2ePort}`,
    port: e2ePort,
    reuseExistingServer: false,
  },
  projects: [
    { name: "chromium", testIgnore: /audio\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    { name: "audio", testMatch: /audio\.spec\.ts/, dependencies: ["chromium"], use: { ...devices["Desktop Chrome"] } },
  ],
});
