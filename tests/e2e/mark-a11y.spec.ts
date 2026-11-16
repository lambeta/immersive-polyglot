import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { launchWithExtension, type LaunchedExtension } from "../support/load-extension.js";
import { startStubProvider, type StubProvider } from "../support/stub-provider.js";
import {
  configureProviders,
  sendToTab,
  waitForContentScript,
  waitForMarks,
} from "../support/e2e-fixtures.js";

/** US4 — the mark is progress, not content: it is not announced, not focusable, and it settles. */

const PAGES_DIR = fileURLToPath(new URL("../fixtures/pages", import.meta.url));

let stub: StubProvider;
let extension: LaunchedExtension;

test.beforeEach(async () => {
  stub = await startStubProvider({ staticDir: PAGES_DIR, latencyMs: 900 });
  extension = await launchWithExtension();
  await configureProviders(extension, [
    {
      id: "p_stub",
      name: "Stub",
      endpoint: `${stub.origin}/v1/chat/completions`,
      model: "stub-model",
      secret: "sk-e2e-abcdef123456",
      timeoutMs: 20_000,
    },
  ]);
});

test.afterEach(async () => {
  await extension.close();
  await stub.close();
});

async function markFacts(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const mark = document.querySelector('[data-ipt="pending"]');
    if (!mark) return null;
    const style = window.getComputedStyle(mark);
    return {
      text: (mark.textContent ?? "").trim(),
      ariaHidden: mark.getAttribute("aria-hidden"),
      inTabOrder: mark.hasAttribute("tabindex"),
      width: style.width,
      height: style.height,
      animationName: style.animationName,
      displayStyle: mark.hasAttribute("data-ipt-style"),
      opacity: Number.parseFloat(style.opacity),
    };
  });
}

test("the mark is wordless, hidden from assistive technology and never focusable (FR-005, FR-028)", async () => {
  const page = await extension.openPage(`${stub.origin}/pages/blog-post.html`);
  await waitForContentScript(page);
  await sendToTab(extension, page.url(), { type: "translatePage" });
  await waitForMarks(page);

  const facts = await markFacts(page);
  expect(facts).not.toBeNull();
  expect(facts?.text).toBe("");
  expect(facts?.ariaHidden).toBe("true");
  expect(facts?.inTabOrder).toBe(false);
  expect(facts?.displayStyle).toBe(false);
  expect(facts?.width).toBe("14px");
  expect(facts?.opacity).toBeGreaterThan(0);
});

test("reduced motion stops the rotation but keeps the mark visible (FR-029, SC-010)", async () => {
  const page = await extension.openPage(`${stub.origin}/pages/blog-post.html`);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await waitForContentScript(page);

  await sendToTab(extension, page.url(), { type: "translatePage" });
  await waitForMarks(page);

  const facts = await markFacts(page);
  expect(facts?.animationName).toBe("none");
  expect(facts?.opacity).toBeGreaterThan(0);
  expect(facts?.width).toBe("14px");
});

test("none of the fifteen display styles reaches the mark (FR-005)", async () => {
  const page = await extension.openPage(`${stub.origin}/pages/blog-post.html`);
  await waitForContentScript(page);
  const url = page.url();

  for (const style of ["blur", "transparency", "marker", "underline-dashed", "highlight", "quote"]) {
    await sendToTab(extension, url, { type: "setDisplayStyle", style });
    await sendToTab(extension, url, { type: "translatePage" });
    await waitForMarks(page);

    const facts = await page.evaluate(() => {
      const mark = document.querySelector('[data-ipt="pending"]');
      const computed = mark ? window.getComputedStyle(mark) : null;
      return {
        styled: mark?.hasAttribute("data-ipt-style") ?? true,
        filter: computed?.filter ?? "none",
        backgroundImage: computed?.backgroundImage ?? "none",
        textDecoration: computed?.textDecorationLine ?? "none",
        opacity: Number.parseFloat(computed?.opacity ?? "1"),
      };
    });

    expect(facts.styled).toBe(false);
    expect(facts.filter).toBe("none");
    expect(facts.backgroundImage).toBe("none");
    expect(facts.textDecoration).toBe("none");
    expect(facts.opacity).toBeGreaterThan(0);

    await sendToTab(extension, url, { type: "toggleTranslation" });
  }
});

test("the mark does not grow with the reader's translation type size (FR-030)", async () => {
  const page = await extension.openPage(`${stub.origin}/pages/blog-post.html`);
  await waitForContentScript(page);
  await sendToTab(extension, page.url(), {
    type: "setTypography",
    typography: { fontFamily: "", fontScale: 200 },
  });
  await sendToTab(extension, page.url(), { type: "translatePage" });
  await waitForMarks(page);

  const facts = await markFacts(page);
  expect(facts?.width).toBe("14px");
  expect(facts?.height).toBe("14px");
});
