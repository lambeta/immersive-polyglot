import { defineConfig } from "vitest/config";

/**
 * Two test projects, one command: pure logic runs on node ("tests/unit"), page-mutation logic
 * runs in jsdom ("tests/dom"). A file's directory decides its environment, so a test that needs
 * a DOM cannot silently run without one.
 */
export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/dom/**/*.test.ts"],
    environmentMatchGlobs: [
      ["tests/dom/**", "jsdom"],
      ["tests/unit/**", "node"],
    ],
    environment: "node",
    globals: false,
    restoreMocks: true,
    testTimeout: 15000,
    pool: "forks",
  },
});
