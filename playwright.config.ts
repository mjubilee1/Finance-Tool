import { defineConfig, devices } from "@playwright/test";
import path from "path";

const authFile = path.join(__dirname, "e2e/.auth/yc-session.json");

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 120_000,
  expect: {
    timeout: 30_000,
  },
  use: {
    baseURL: "https://account.ycombinator.com",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    headless: process.env.PLAYWRIGHT_HEADED !== "true",
  },
  projects: [
    {
      name: "yc-chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: process.env.YC_USE_SAVED_SESSION === "true" ? authFile : undefined,
      },
    },
  ],
  outputDir: "test-results",
});
