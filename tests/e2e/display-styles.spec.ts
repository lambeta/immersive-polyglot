import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import {
  launchWithExtension,
  readExtensionStorage,
  type LaunchedExtension,
} from "../support/load-extension.js";
import { startStubProvider, type StubProvider } from "../support/stub-provider.js";
import {
  configureProviders,
  sendToTab,
  waitForContentScript,
  waitForTranslation,
  writeSettings,
} from "../support/e2e-fixtures.js";

/**
 * Display styles (US1, US2, US4): the feature against the real extension, real
 * chrome.storage.local and real HTTP. No test-only code path is used.
 */

const PAGES_DIR = fileURLToPath(new URL("../fixtures/pages", import.meta.url));

let stub: StubProvider;
let extension: LaunchedExtension;

test.beforeEach(async () => {
  stub = await startStubProvider({ staticDir: PAGES_DIR });
  extension = await launchWithExtension();
});

test.afterEach(async () => {
  await extension.close();
  await stub.close();
});

async function seedProvider(): Promise<void> {
  await configureProviders(extension, [
    {
      id: "p_styles",
      name: "Stub",
      endpoint: stub.origin + "/v1/chat/completions",
      model: "stub-model",
      secret: "sk-e2e-abcdef123456",
    },
  ]);
}

function pageUrlFor(name: string): string {
  return stub.origin + "/pages/" + name;
}

async function translate(pageUrl: string) {
  const page = await extension.openPage(pageUrl);
  await waitForContentScript(page);
  await sendToTab(extension, pageUrl, { type: "translatePage" });
  await waitForTranslation(page, 3);
  return page;
}

test("the Display panel lists the fifteen styles and applies one without re-translating", async () => {
  await seedProvider();
  const pageUrl = pageUrlFor("news-article-a.html");
  const page = await translate(pageUrl);
  const requestsBefore = stub.requests.length;

  const options = await extension.openOptions();
  await options.click('button[aria-controls="panel-display"]');

  const radios = options.locator('input[name="display-style"]');
  await expect(radios).toHaveCount(15);
  const names = await options.locator(".style-picker-name").allTextContents();
  expect(names[0]).toBe("None");
  expect(names[9]).toBe("Highlight");
  expect(names[14]).toBe("Gray");

  await options.check("#display-style-highlight");
  await options.click("#display-style-save");
  await expect(options.locator("#display-style-feedback")).toContainText("saved", {
    ignoreCase: true,
  });

  // FR-002/FR-003: already-rendered blocks restyle, and no provider request is issued.
  await page.waitForFunction(() => {
    const targets = Array.from(document.querySelectorAll('[data-ipt="target"]'));
    return (
      targets.length > 0 &&
      targets.every((target) => target.getAttribute("data-ipt-style") === "highlight")
    );
  });
  expect(stub.requests.length).toBe(requestsBefore);

  // The decoration is really rendered, not just an attribute that happens to be set.
  const background = await page
    .locator('[data-ipt="target"]')
    .first()
    .evaluate((element) => getComputedStyle(element as HTMLElement).backgroundColor);
  expect(background).not.toBe("rgba(0, 0, 0, 0)");

  // SC-003: the choice is persisted.
  const stored = await readExtensionStorage(options);
  expect((stored["ui"] as Record<string, unknown>)["displayStyle"]).toBe("highlight");

  // SC-003: it still applies after a reload and a fresh translation.
  await page.reload();
  await waitForContentScript(page);
  await sendToTab(extension, pageUrl, { type: "translatePage" });
  await waitForTranslation(page, 3);
  await expect(page.locator('[data-ipt="target"]').first()).toHaveAttribute(
    "data-ipt-style",
    "highlight",
  );
});

test("every option shows a labelled icon and the sample follows the selection before saving", async () => {
  await seedProvider();
  const options = await extension.openOptions();
  await options.click('button[aria-controls="panel-display"]');

  await expect(options.locator("svg.style-icon")).toHaveCount(15);
  const titles = await options.locator(".style-picker svg title").allTextContents();
  expect(titles).toEqual([
    "None",
    "Dashed underline",
    "Solid underline",
    "Dashed border",
    "Solid border",
    "Blur (study mode)",
    "Transparency",
    "Dotted underline",
    "Divider",
    "Highlight",
    "Marker pen",
    "Marker pen 2",
    "Quote",
    "Weakened",
    "Gray",
  ]);

  // FR-008: every radio is announced with its style name, not with its icon.
  await expect(options.getByRole("radio", { name: "Marker pen", exact: true })).toBeVisible();

  // FR-009: the sample updates before saving; storage is untouched by the click.
  const sample = options.locator(".ipt-style-sample");
  await expect(sample).toHaveAttribute("data-ipt-style", "none");
  await options.check("#display-style-marker");
  await expect(sample).toHaveAttribute("data-ipt-style", "marker");
  const stored = await readExtensionStorage(options);
  expect((stored["ui"] as Record<string, unknown>)["displayStyle"] ?? "none").toBe("none");

  // SC-006: the group is operable by keyboard alone.
  await options.locator("#display-style-marker").focus();
  await options.keyboard.press("ArrowDown");
  await expect(options.locator("#display-style-marker-2")).toBeChecked();

  // SC-011: at 200% zoom the picker does not overflow and the icons still render.
  await options.evaluate(() => {
    document.body.style.zoom = "2";
  });
  const overflow = await options
    .locator("#panel-display")
    .evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  const iconBox = await options.locator("svg.style-icon").first().boundingBox();
  expect(iconBox?.width ?? 0).toBeGreaterThan(0);
});

test("the page control shows the same selection as the options page (FR-005)", async () => {
  await seedProvider();
  const options = await extension.openOptions();
  await options.click('button[aria-controls="panel-display"]');
  await options.check("#display-style-quote");
  await options.click("#display-style-save");
  await expect(options.locator("#display-style-feedback")).toContainText("saved", {
    ignoreCase: true,
  });

  const page = await extension.openPage(pageUrlFor("news-article-a.html"));
  await waitForContentScript(page);
  await page.bringToFront();

  const popup = await extension.openPage(extension.popupUrl);
  await expect(popup.locator("#popup-display-style-quote")).toBeChecked();
});

test("an unknown stored site style falls back to none without blocking translation (FR-020)", async () => {
  await seedProvider();
  await writeSettings(extension, {
    sites: [{ sitePattern: "127.0.0.1", displayStyle: "not-a-style", autoTranslate: false }],
  });

  const page = await translate(pageUrlFor("news-article-a.html"));
  await expect(page.locator('[data-ipt="target"]').first()).toHaveAttribute(
    "data-ipt-style",
    "none",
  );
});

test("a style chosen in the page control applies to this site only (FR-019)", async () => {
  await seedProvider();
  const options = await extension.openOptions();
  await options.click('button[aria-controls="panel-display"]');
  await options.check("#display-style-highlight");
  await options.click("#display-style-save");
  await expect(options.locator("#display-style-feedback")).toContainText("saved", {
    ignoreCase: true,
  });

  const page = await extension.openPage(pageUrlFor("news-article-a.html"));
  await waitForContentScript(page);
  await page.bringToFront();

  const popup = await extension.openPage(extension.popupUrl);
  // The popup builds its picker during boot; wait for it explicitly so load alone is not enough.
  await expect(popup.locator("#popup-display-style-marker")).toBeAttached({ timeout: 30_000 });
  await popup.check("#popup-display-style-marker", { timeout: 30_000 });
  await expect
    .poll(async () => {
      const stored = await readExtensionStorage(popup);
      return (stored["sites"] as { displayStyle?: string }[]).some(
        (site) => site.displayStyle === "marker",
      );
    })
    .toBe(true);
  await popup.close();
  // Only one tab may hold this URL, or sendToTab may address the wrong one below.
  await page.close();

  // The override is on the site, not on the device-wide default.
  const optionsAgain = await extension.openOptions();
  const stored = await readExtensionStorage(optionsAgain);
  expect((stored["ui"] as Record<string, unknown>)["displayStyle"]).toBe("highlight");

  // Removing the override returns the site to the global style.
  await optionsAgain.evaluate(async () => {
    const current = await chrome.storage.local.get(null);
    const sites = (current["sites"] as { displayStyle?: string }[]) ?? [];
    await chrome.storage.local.set({
      ...current,
      sites: sites.map((site) => {
        const next = { ...site };
        delete next.displayStyle;
        return next;
      }),
    });
    await chrome.runtime.sendMessage({ type: "providerChanged" });
  });

  const translated = await translate(pageUrlFor("news-article-a.html"));
  await expect(translated.locator('[data-ipt="target"]').first()).toHaveAttribute(
    "data-ipt-style",
    "highlight",
  );
});
test("the Divider style draws a short dashed line above each translation (FR-001, FR-002)", async () => {
  await seedProvider();
  const pageUrl = pageUrlFor("news-article-a.html");
  const page = await translate(pageUrl);
  const requestsBefore = stub.requests.length;

  await sendToTab(extension, pageUrl, { type: "setDisplayStyle", style: "divider" });
  await page.waitForFunction(() => {
    const targets = Array.from(document.querySelectorAll('[data-ipt="target"]'));
    return (
      targets.length > 0 &&
      targets.every((target) => target.getAttribute("data-ipt-style") === "divider")
    );
  });

  const metrics = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('[data-ipt="target"]')).map((element) => {
      const style = getComputedStyle(element);
      const before = getComputedStyle(element, "::before");
      const rect = element.getBoundingClientRect();
      return {
        display: before.display,
        width: Number.parseFloat(before.width || "0"),
        borderStyle: before.borderBlockStartStyle,
        thickness: Number.parseFloat(before.borderBlockStartWidth || "0"),
        elementBlockStart: Number.parseFloat(style.borderBlockStartWidth || "0"),
        elementInlineStart: Number.parseFloat(style.borderInlineStartWidth || "0"),
        elementBlockEnd: Number.parseFloat(style.borderBlockEndWidth || "0"),
        fontStyle: style.fontStyle,
        blockWidth: rect.width,
        lineCount: (() => {
          const range = document.createRange();
          range.selectNodeContents(element);
          return Array.from(range.getClientRects()).filter((line) => line.height > 0).length;
        })(),
      };
    }),
  );

  expect(metrics.length).toBeGreaterThanOrEqual(3);
  for (const metric of metrics) {
    expect(metric.display).toBe("block");
    expect(metric.borderStyle).toBe("dashed");
    expect(metric.thickness).toBeGreaterThan(0);
    expect(metric.thickness).toBeLessThanOrEqual(2);
    // A short stubbed line: roughly fifteen dashes, never the block's full width and never a stub
    // of one or two dashes.
    expect(metric.width).toBeGreaterThan(60);
    expect(metric.width).toBeLessThanOrEqual(90);
    expect(metric.width).toBeLessThan(metric.blockWidth * 0.5);
    // The block itself draws nothing: no edge rule, no bottom rule.
    expect(metric.elementBlockStart).toBe(0);
    expect(metric.elementInlineStart).toBe(0);
    expect(metric.elementBlockEnd).toBe(0);
    expect(metric.fontStyle).not.toBe("italic");
  }
  expect(metrics.some((metric) => metric.lineCount >= 3)).toBe(true);

  // The line stays attached when the display mode changes, and no request is issued.
  for (const mode of ["above", "only"] as const) {
    await sendToTab(extension, pageUrl, { type: "setDisplayMode", mode });
    await expect
      .poll(() =>
        page
          .locator('[data-ipt="target"]')
          .first()
          .evaluate(
            (element) =>
              getComputedStyle(element as HTMLElement, "::before").borderBlockStartStyle,
          ),
      )
      .toBe("dashed");
  }
  expect(stub.requests.length).toBe(requestsBefore);
});

test("the panel's display position is one three-way group and sticks to the site (T024)", async () => {
  await seedProvider();
  const page = await translate(pageUrlFor("news-article-a.html"));
  await page.bringToFront();

  const popup = await extension.context.newPage();
  await popup.setViewportSize({ width: 384, height: 720 });
  await popup.goto(extension.popupUrl);
  await popup.waitForSelector("#translate");

  const radios = popup.locator('input[name="popup-mode"]');
  await expect(radios).toHaveCount(3);
  // A radio group, not three toggles: exactly one is chosen, and it is the stored mode.
  await expect(popup.locator('input[name="popup-mode"]:checked')).toHaveCount(1);
  await expect(popup.locator('input[name="popup-mode"][value="bilingual"]')).toBeChecked();
  // Each option is announced with the full sentence, not only the short word on the track.
  await expect(popup.getByRole("radio", { name: "Translation above original" })).toHaveCount(1);

  await popup.check('input[name="popup-mode"][value="above"]');
  // The page follows the command: the renderer marks the translation as placed before its source.
  await expect
    .poll(() =>
      page
        .locator('[data-ipt="target"]')
        .first()
        .evaluate((element) => element.getAttribute("data-ipt-position") ?? "after"),
    )
    .toBe("before");

  // FR-005: the choice is attached to this site, and reopening the panel keeps it.
  await expect
    .poll(async () => {
      const stored = await readExtensionStorage(popup);
      const sites = (stored["sites"] as { displayMode?: string }[] | undefined) ?? [];
      return sites.some((site) => site.displayMode === "above");
    })
    .toBe(true);
  await popup.reload();
  await popup.waitForSelector("#translate");
  await expect(popup.locator('input[name="popup-mode"][value="above"]')).toBeChecked();
});

test("the panel names the chosen style in words and follows the settings page (T025)", async () => {
  await seedProvider();
  const page = await translate(pageUrlFor("news-article-a.html"));
  await page.bringToFront();
  const requestsBefore = stub.requests.length;

  const popup = await extension.context.newPage();
  await popup.setViewportSize({ width: 384, height: 720 });
  await popup.goto(extension.popupUrl);
  await popup.waitForSelector("#translate");

  await expect(popup.locator("#style-current")).toHaveText("Current style: None");
  // The tile is icon-only, but the radio still carries the style's catalogue name.
  await expect(popup.getByRole("radio", { name: "Marker pen", exact: true })).toHaveCount(1);

  await popup.check("#popup-display-style-marker");
  await expect(popup.locator("#style-current")).toHaveText("Current style: Marker pen");
  // FR-002/SC-003: already-rendered translations redraw with no new provider request.
  await expect
    .poll(() =>
      page
        .locator('[data-ipt="target"]')
        .first()
        .evaluate((element) => element.getAttribute("data-ipt-style")),
    )
    .toBe("marker");
  expect(stub.requests.length).toBe(requestsBefore);

  // SC-006: arrow keys move the selection inside the group.
  await popup.locator("#popup-display-style-marker").focus();
  await popup.keyboard.press("ArrowDown");
  await expect(popup.locator("#popup-display-style-marker-2")).toBeChecked();
  await expect(popup.locator("#style-current")).toHaveText("Current style: Marker pen 2");

  // FR-027: a change made on the settings page reaches the open panel without a reload.
  await writeSettings(extension, {
    sites: [{ sitePattern: "127.0.0.1", displayStyle: "quote", autoTranslate: false }],
  });
  await expect(popup.locator("#style-current")).toHaveText("Current style: Quote");
  await expect(popup.locator("#popup-display-style-quote")).toBeChecked();
});
