import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { launchWithExtension, type LaunchedExtension } from "../support/load-extension.js";
import { startStubProvider, type StubProvider } from "../support/stub-provider.js";
import {
  configureProviders,
  sendToTab,
  waitForContentScript,
  waitForTranslation,
  writeSettings,
} from "../support/e2e-fixtures.js";

/**
 * US5 (T078): glossary, style and selection translation. The product's responsibility is that the
 * instruction is composed and sent on every request; the model's obedience is the provider's.
 * Code protection and selection scope are asserted on the page itself.
 */

const PAGES_DIR = fileURLToPath(new URL("../fixtures/pages", import.meta.url));
let stub: StubProvider;
let extension: LaunchedExtension;

test.beforeEach(async () => {
  stub = await startStubProvider({ staticDir: PAGES_DIR });
  extension = await launchWithExtension();
  await configureProviders(extension, [
    {
      id: "p_us5",
      name: "Stub",
      endpoint: `${stub.origin}/v1/chat/completions`,
      model: "stub-model",
      secret: "sk-e2e-us5-0001",
    },
  ]);
  await writeSettings(extension, {
    glossary: [
      {
        sourceTerm: "harbour",
        targetTerm: "港口",
        sourceLang: "en",
        targetLang: "zh",
        caseSensitive: false,
      },
    ],
    style: { instruction: "Formal register; no contractions.", temperature: 0 },
  });
});

test.afterEach(async () => {
  await extension.close();
  await stub.close();
});

function systemMessages(): string[] {
  return stub.requests.map((request) => {
    const body = request.body as { messages?: { role: string; content: string }[] };
    return body.messages?.find((message) => message.role === "system")?.content ?? "";
  });
}

test("the glossary and the style instruction are applied to every request, not just the first", async () => {
  const url = `${stub.origin}/pages/news-article-a.html`;
  const page = await extension.openPage(url);
  await waitForContentScript(page);

  await sendToTab(extension, url, { type: "translatePage" });
  await waitForTranslation(page, 2);

  const messages = systemMessages();
  expect(messages.length).toBeGreaterThan(0);
  for (const message of messages) {
    expect(message).toContain('"harbour" must be rendered as "港口"');
    expect(message).toContain("Formal register; no contractions.");
    expect(message).toContain("Chinese (Simplified)");
  }

  const texts = await page.locator('[data-ipt="target"]').allTextContents();
  expect(texts.length).toBeGreaterThan(0);
});

test("the style section writes the instruction and leaves the removed control alone (T036)", async () => {
  // A profile that still holds a temperature value: the control is gone from the surface, the
  // stored value is not the surface's business, and the wire keeps sending its own fixed value.
  await writeSettings(extension, { style: { instruction: "", temperature: 0.7 } });
  const options = await extension.openOptions();
  await options.click('button[aria-controls="panel-style"]');

  await expect(options.locator("#style-temperature")).toHaveCount(0);
  await expect(options.locator("#style-instruction")).toBeVisible();
  await expect(options.locator("#style-instruction")).toHaveAttribute("placeholder", /register/i);

  await options.fill("#style-instruction", "Formal register; no contractions.");
  await options.click("#style-save");
  await expect(options.locator("#style-feedback")).toContainText("Style saved");

  const stored = await options.evaluate(() => chrome.storage.local.get("style"));
  const style = stored["style"] as { instruction?: string; temperature?: number } | undefined;
  expect(style?.instruction).toBe("Formal register; no contractions.");
  expect(style?.temperature).toBe(0.7);
  await options.close();
});

test("code blocks and inline code are neither translated nor altered", async () => {
  const url = `${stub.origin}/pages/blog-code.html`;
  const page = await extension.openPage(url);
  await waitForContentScript(page);

  const before = await page.evaluate(() => ({
    pre: Array.from(document.querySelectorAll("pre")).map((node) => node.textContent),
    code: Array.from(document.querySelectorAll("code")).map((node) => node.textContent),
  }));

  await sendToTab(extension, url, { type: "translatePage" });
  await waitForTranslation(page, 2);

  const after = await page.evaluate(() => ({
    pre: Array.from(document.querySelectorAll("pre")).map((node) => node.textContent),
    code: Array.from(document.querySelectorAll("code")).map((node) => node.textContent),
    insideCode: document.querySelectorAll("pre [data-ipt], code [data-ipt]").length,
  }));

  expect(after.pre).toEqual(before.pre);
  expect(after.code).toEqual(before.code);
  expect(after.insideCode).toBe(0);
});

test("translating a selection touches nothing outside the selection", async () => {
  const url = `${stub.origin}/pages/docs-guide.html`;
  const page = await extension.openPage(url);
  await waitForContentScript(page);

  await page.evaluate(() => {
    const paragraphs = document.querySelectorAll("article p");
    const target = paragraphs[1] ?? paragraphs[0];
    if (!target) throw new Error("fixture has no paragraph");
    const range = document.createRange();
    range.selectNodeContents(target);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });

  await sendToTab(extension, url, { type: "translateSelection" });
  await waitForTranslation(page, 1);

  const targets = await page.locator('[data-ipt="target"]').count();
  expect(targets).toBe(1);

  const placement = await page.evaluate(() => {
    const target = document.querySelector('[data-ipt="target"]');
    const previous = target?.previousElementSibling;
    return { previousText: previous?.textContent ?? "", tag: previous?.tagName ?? "" };
  });
  expect(placement.tag).toBe("P");
  expect(placement.previousText.length).toBeGreaterThan(0);
});

test("a selection with nothing selected is refused with a message, not a silent no-op", async () => {
  const url = `${stub.origin}/pages/docs-guide.html`;
  const page = await extension.openPage(url);
  await waitForContentScript(page);

  const reply = (await sendToTab(extension, url, { type: "translateSelection" })) as {
    ok: boolean;
    errorClass?: string;
  };
  expect(reply.ok).toBe(false);
  expect(reply.errorClass).toBe("selectionEmpty");
  expect(await page.locator('[data-ipt="target"]').count()).toBe(0);
});
