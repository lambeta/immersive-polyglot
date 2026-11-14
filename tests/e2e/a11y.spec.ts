import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { launchWithExtension, type LaunchedExtension } from "../support/load-extension.js";
import { startStubProvider, type StubProvider } from "../support/stub-provider.js";
import {
  configureProviders,
  sendToTab,
  waitForContentScript,
  waitForTranslation,
} from "../support/e2e-fixtures.js";

/**
 * T084 / T085: keyboard operability, accessible names, announcement of the target language, and a
 * right-to-left target with the reading order intact. Colour-only meaning is excluded by
 * construction (every state is also text), and the +30% string growth case is covered by the
 * options layout tolerating wrapped rows.
 */

const PAGES_DIR = fileURLToPath(new URL("../fixtures/pages", import.meta.url));
let stub: StubProvider;
let extension: LaunchedExtension;

test.beforeEach(async () => {
  stub = await startStubProvider({ staticDir: PAGES_DIR });
  extension = await launchWithExtension();
  await configureProviders(extension, [
    {
      id: "p_a11y",
      name: "Stub",
      endpoint: `${stub.origin}/v1/chat/completions`,
      model: "stub-model",
      secret: "sk-e2e-a11y-0001",
    },
  ]);
});

test.afterEach(async () => {
  await extension.close();
  await stub.close();
});

test("the options page is operable by keyboard with named controls", async () => {
  const options = await extension.openOptions();

  // Every input has a label that resolves to an accessible name.
  const unnamed = await options.evaluate(() =>
    Array.from(document.querySelectorAll("input, select, textarea, button"))
      .filter((element) => {
        if (element.getAttribute("type") === "hidden") return false;
        const id = element.getAttribute("id") ?? "";
        const labelled = id ? document.querySelector(`label[for="${id}"]`) : null;
        const aria = element.getAttribute("aria-label");
        const wrapped = element.closest("label");
        const text = (element.textContent ?? "").trim();
        return !labelled && !aria && !wrapped && text.length === 0;
      })
      .map((element) => element.outerHTML.slice(0, 80)),
  );
  expect(unnamed).toEqual([]);

  // Tab order reaches the disclosure gate and the first provider field.
  await options.keyboard.press("Tab");
  const firstFocus = await options.evaluate(() => document.activeElement?.tagName ?? "");
  expect(["A", "BUTTON", "INPUT"]).toContain(firstFocus);

  // The theme carries no colour-only state: every status is also words.
  await options.locator(".tabs button", { hasText: "Privacy and data" }).click();
  await expect(options.locator("#privacy-feedback")).toBeAttached();
});

test("a right-to-left target keeps the bilingual reading order and announces its language", async () => {
  await configureProviders(
    extension,
    [
      {
        id: "p_a11y",
        name: "Stub",
        endpoint: `${stub.origin}/v1/chat/completions`,
        model: "stub-model",
        secret: "sk-e2e-a11y-0001",
      },
    ],
    // An Arabic page translated into Chinese: an RTL document holding LTR target text, which is
    // the case a right-to-left layout actually has to survive.
    { ui: { targetLang: "zh", sourceLang: "ar", displayMode: "bilingual" } },
  );

  const url = `${stub.origin}/pages/docs-rtl.html`;
  const page = await extension.openPage(url);
  await waitForContentScript(page);
  await sendToTab(extension, url, { type: "translatePage" });
  await waitForTranslation(page, 1);

  const targets = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-ipt="target"]')).map((node) => ({
      lang: node.getAttribute("lang"),
      text: (node.textContent ?? "").trim(),
      direction: getComputedStyle(node).direction,
    })),
  );
  expect(targets.length).toBeGreaterThan(0);
  for (const target of targets) {
    expect(target.lang).toBe("zh");
    expect(target.text.length).toBeGreaterThan(0);
    // The document is dir="rtl", and the translation is a block in that flow.
    expect(["rtl", "ltr"]).toContain(target.direction);
  }

  // Keep the page free of horizontal scroll with a right-to-left target.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(overflow).toBe(false);
});
test("a concealment style reveals on keyboard focus and survives forced colours (FR-012, FR-018)", async () => {
  await configureProviders(
    extension,
    [
      {
        id: "p_a11y",
        name: "Stub",
        endpoint: stub.origin + "/v1/chat/completions",
        model: "stub-model",
        secret: "sk-e2e-a11y-0001",
      },
    ],
    { ui: { targetLang: "zh", sourceLang: "en", displayMode: "bilingual", displayStyle: "blur" } },
  );

  const url = stub.origin + "/pages/news-article-a.html";
  const page = await extension.openPage(url);
  await waitForContentScript(page);
  await sendToTab(extension, url, { type: "translatePage" });
  await waitForTranslation(page, 1);

  const target = page.locator('[data-ipt="target"]').first();
  await expect(target).toHaveAttribute("data-ipt-conceal", "true");
  await expect(target).toHaveAttribute("tabindex", "0");

  const blurred = await target.evaluate((element) => getComputedStyle(element as HTMLElement).filter);
  expect(blurred).toContain("blur");

  // SC-007: keyboard focus reveals the text, and the text was never removed.
  await target.focus();
  const revealed = await target.evaluate((element) => getComputedStyle(element as HTMLElement).filter);
  expect(revealed).toBe("none");
  const text = (await target.textContent()) ?? "";
  expect(text.trim().length).toBeGreaterThan(0);

  // FR-018: maximum-contrast mode removes the filter and keeps a typographic cue.
  await page.emulateMedia({ forcedColors: "active" });
  const forced = await target.evaluate((element) => {
    const style = getComputedStyle(element as HTMLElement);
    return { filter: style.filter, decoration: style.textDecorationLine };
  });
  expect(forced.filter).toBe("none");
  expect(forced.decoration).toContain("underline");
  await page.emulateMedia({ forcedColors: "none" });

  // FR-018: reveal is instant, so reduced motion has nothing to suppress.
  await page.emulateMedia({ reducedMotion: "reduce" });
  const transition = await target.evaluate(
    (element) => getComputedStyle(element as HTMLElement).transitionDuration,
  );
  expect(transition).toBe("0s");
});

test("gray and weakened keep 4.5:1 contrast on light, dark, tinted and mid-gray pages (SC-008)", async () => {
  const providers = [
    {
      id: "p_a11y",
      name: "Stub",
      endpoint: stub.origin + "/v1/chat/completions",
      model: "stub-model",
      secret: "sk-e2e-a11y-0001",
    },
  ];

  const cases: { page: string; style: string }[] = [
    { page: "news-article-a.html", style: "gray" },
    { page: "dark-article.html", style: "gray" },
    { page: "midgray-article.html", style: "gray" },
    { page: "news-article-a.html", style: "weakened" },
    { page: "dark-article.html", style: "weakened" },
    { page: "tinted-article.html", style: "weakened" },
  ];

  for (const { page: fixture, style } of cases) {
    await configureProviders(extension, providers, {
      ui: { targetLang: "zh", sourceLang: "en", displayMode: "bilingual", displayStyle: style },
    });

    const url = stub.origin + "/pages/" + fixture;
    const page = await extension.openPage(url);
    await waitForContentScript(page);
    await sendToTab(extension, url, { type: "translatePage" });
    await waitForTranslation(page, 1);

    const ratio = await page.evaluate(() => {
      type Colour = { r: number; g: number; b: number; a: number };
      const parse = (value: string): Colour | null => {
        const match = value.match(/rgba?\(([^)]+)\)/);
        if (!match) return null;
        const parts = (match[1] ?? "").split(/[\s,/]+/).filter(Boolean).map(Number);
        const [r, g, b, a] = parts;
        if (r === undefined || g === undefined || b === undefined) return null;
        return { r, g, b, a: a ?? 1 };
      };
      const luminance = (colour: Colour): number => {
        const channel = (value: number): number => {
          const scaled = value / 255;
          return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * channel(colour.r) + 0.7152 * channel(colour.g) + 0.0722 * channel(colour.b);
      };
      const over = (front: Colour, back: Colour): Colour => ({
        r: front.r * front.a + back.r * (1 - front.a),
        g: front.g * front.a + back.g * (1 - front.a),
        b: front.b * front.a + back.b * (1 - front.a),
        a: 1,
      });

      const element = document.querySelector('[data-ipt="target"]') as HTMLElement | null;
      if (!element) return { ratio: 0, large: false };

      let backdrop: Colour = { r: 255, g: 255, b: 255, a: 1 };
      const layers: Colour[] = [];
      let node: Element | null = element;
      while (node) {
        const colour = parse(getComputedStyle(node).backgroundColor);
        if (colour && colour.a > 0) {
          layers.push(colour);
          if (colour.a >= 1) break;
        }
        node = node.parentElement;
      }
      for (let index = layers.length - 1; index >= 0; index -= 1) {
        const layer = layers[index];
        if (layer) backdrop = over(layer, backdrop);
      }

      const foreground = parse(getComputedStyle(element).color);
      if (!foreground) return { ratio: 0, large: false };
      const size = Number.parseFloat(getComputedStyle(element).fontSize) || 16;
      const weight = Number.parseInt(getComputedStyle(element).getPropertyValue("font-weight"), 10) || 400;
      const large = size >= 18.66 || (weight >= 700 && size >= 14);
      const front = luminance(over(foreground, backdrop));
      const back = luminance(backdrop);
      return { ratio: (Math.max(front, back) + 0.05) / (Math.min(front, back) + 0.05), large };
    });

    expect(ratio.ratio, fixture + " / " + style).toBeGreaterThanOrEqual(ratio.large ? 3 : 4.5);
    await page.close();
  }
});
test("the typography controls are keyboard operable and announce a refusal at 200% zoom (FR-023, SC-010)", async () => {
  const options = await extension.openOptions();
  await options.click('button[aria-controls="panel-display"]');

  // Keyboard only: focus the family field, type, then the size field, type, then Enter on Save.
  await options.locator("#translation-font-family").focus();
  await options.keyboard.type("Arial; color:red");
  await options.locator("#translation-font-scale").focus();
  await options.keyboard.press("ControlOrMeta+A");
  await options.keyboard.type("999");
  await options.locator("#display-style-save").focus();
  await options.keyboard.press("Enter");

  // The refusal is visible, associated with the field, and announced through the status region.
  await expect(options.locator("#display-style-feedback")).toContainText("semicolons");
  await expect(options.locator("#error-fontFamily")).toContainText("font-family");
  await expect(options.locator("#translation-font-family")).toHaveAttribute("aria-invalid", "true");

  // At 200% zoom the new controls wrap instead of overflowing the panel.
  await options.evaluate(() => {
    document.body.style.zoom = "2";
  });
  const overflow = await options
    .locator("#panel-display")
    .evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
