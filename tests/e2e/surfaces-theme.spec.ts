import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { launchWithExtension, type LaunchedExtension } from "../support/load-extension.js";
import { startStubProvider, type StubProvider } from "../support/stub-provider.js";
import { configureProviders, waitForContentScript } from "../support/e2e-fixtures.js";
import {
  contrastOf,
  fontsLoaded,
  trackExternalRequests,
} from "../support/surface-metrics.js";

/**
 * Feature 006 US4 (T029): both surfaces follow the browser's theme from one set of tokens, and the
 * text stays readable in each of them.
 *
 * The assertion is not "it looks dark" but "no ground is still light and every measured text pair
 * clears 4.5:1", which is what FR-019 and SC-006 actually claim. It also holds the privacy promise
 * of the bundled faces: opening either surface must not reach a third party.
 */

const PAGES_DIR = fileURLToPath(new URL("../fixtures/pages", import.meta.url));

const PANEL_PAIRS = [".panel__site", "#status", ".btn--primary", ".style-picker legend"];
const SETTINGS_PAIRS = [".lede", ".hint", ".btn--primary", '.tabs button[aria-expanded="false"]'];

let stub: StubProvider;
let extension: LaunchedExtension;

test.beforeEach(async () => {
  stub = await startStubProvider({ staticDir: PAGES_DIR });
  extension = await launchWithExtension();
  await configureProviders(extension, [
    {
      id: "p_theme",
      name: "Stub",
      endpoint: `${stub.origin}/v1/chat/completions`,
      model: "stub-model",
      secret: "sk-e2e-theme-1234",
    },
  ]);
});

test.afterEach(async () => {
  await extension.close();
  await stub.close();
});

/** Relative luminance of the ground one element paints, so "light" and "dark" are decidable. */
async function groundLuminance(
  page: import("@playwright/test").Page,
  selector: string,
): Promise<number> {
  return page.evaluate((sel) => {
    const element = document.querySelector(sel);
    if (!element) throw new Error("no element for " + sel);
    let node: Element | null = element;
    while (node) {
      const value = getComputedStyle(node).backgroundColor;
      const numbers = value.startsWith("rgb") ? value.match(/[0-9]*[.]?[0-9]+/g) : null;
      const parts = numbers ? numbers.map(Number) : [];
      const [r, g, b, a] = parts;
      if (r !== undefined && g !== undefined && b !== undefined && (a ?? 1) >= 0.9) {
        const channel = (v: number): number => {
          const scaled = v / 255;
          return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
      }
      node = node.parentElement;
    }
    throw new Error("no opaque ground for " + sel);
  }, selector);
}

test("both surfaces render from tokens in either theme and keep their contrast (T029)", async () => {
  const fixture = await extension.openPage(`${stub.origin}/pages/news-article-a.html`);
  await waitForContentScript(fixture);
  await fixture.bringToFront();

  const popup = await extension.context.newPage();
  await popup.setViewportSize({ width: 384, height: 720 });
  await popup.goto(extension.popupUrl);
  await popup.waitForSelector("#translate");
  const options = await extension.openOptions();

  for (const scheme of ["light", "dark"] as const) {
    await popup.emulateMedia({ colorScheme: scheme });
    await options.emulateMedia({ colorScheme: scheme });
    // Colours transition (130 ms) from the old theme; measuring mid-transition measures neither.
    await popup.waitForTimeout(250);
    await options.waitForTimeout(250);

    if (scheme === "dark") {
      // FR-020: nothing keeps a light ground, and native widgets follow the theme.
      expect(await groundLuminance(popup, "body")).toBeLessThan(0.05);
      expect(await groundLuminance(popup, ".btn--primary")).toBeLessThan(0.6);
      expect(await groundLuminance(options, "body")).toBeLessThan(0.05);
      expect(await groundLuminance(options, ".card")).toBeLessThan(0.06);
      expect(await options.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe(
        "light dark",
      );
    } else {
      expect(await groundLuminance(popup, "body")).toBeGreaterThan(0.85);
      expect(await groundLuminance(options, "body")).toBeGreaterThan(0.85);
    }

    for (const reading of await contrastOf(popup, PANEL_PAIRS)) {
      expect(reading.ratio, `panel ${reading.selector} in ${scheme}`).toBeGreaterThanOrEqual(4.5);
    }
    for (const reading of await contrastOf(options, SETTINGS_PAIRS)) {
      expect(reading.ratio, `settings ${reading.selector} in ${scheme}`).toBeGreaterThanOrEqual(4.5);
    }
  }
});

test("a theme change keeps what the reader has typed, and reaches no third party (T029)", async () => {
  const options = await extension.openOptions();
  const external = trackExternalRequests(options, [stub.origin, `chrome-extension://`]);
  await options.reload();
  await options.waitForSelector("#provider-name");

  await options.fill("#provider-name", "Typed before the switch");
  await options.emulateMedia({ colorScheme: "dark" });
  await expect(options.locator("#provider-name")).toHaveValue("Typed before the switch");
  await options.emulateMedia({ colorScheme: "light" });
  await expect(options.locator("#provider-name")).toHaveValue("Typed before the switch");

  const popup = await extension.context.newPage();
  await popup.setViewportSize({ width: 384, height: 720 });
  const popupExternal = trackExternalRequests(popup, [stub.origin, "chrome-extension://"]);
  await popup.goto(extension.popupUrl);
  await popup.waitForSelector("#translate");
  await popup.waitForTimeout(500);

  // FR-026 / SC-009: the faces ship with the extension, so nothing is fetched from a font host.
  expect(await fontsLoaded(popup)).toEqual({ host: true, mono: true });
  expect(await fontsLoaded(options)).toEqual({ host: true, mono: true });
  expect(popupExternal).toEqual([]);
  expect(external).toEqual([]);
});
