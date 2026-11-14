import { defineConfig } from "@playwright/test";

/**
 * End-to-end verification per constitution principle III: a real Chromium, the unpacked
 * extension, real chrome.storage, real HTTP to the stub provider, real fixture pages.
 *
 * Headless Chromium cannot load extensions reliably under Playwright 1.48, so the browser is
 * headed by default and can be forced headless with PW_HEADLESS=1 where the runner supports it.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    headless: process.env.PW_HEADLESS === "1",
    viewport: { width: 1280, height: 800 },
    trace: "retain-on-failure",
  },
  outputDir: "test-results",
});
