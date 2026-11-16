import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { launchWithExtension, type LaunchedExtension } from "../support/load-extension.js";
import { startStubProvider, type StubProvider } from "../support/stub-provider.js";
import {
  configureProviders,
  expectNoResidue,
  jobStatus,
  restorePage,
  sendToTab,
  waitForContentScript,
  waitForTranslation,
} from "../support/e2e-fixtures.js";

/**
 * US1/US2/US3: a long block is one complete passage in the real extension. The captured page is the
 * reported article's front matter; the authored page carries the same shape plus a short block.
 */

const PAGES_DIR = fileURLToPath(new URL("../fixtures/pages", import.meta.url));
const PREFIX = "【译】";
const CAPTURED_PAGE = "article-tests-as-data.html";
const AUTHORED_PAGE = "article-abstract.html";

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

async function configure(
  displayMode: "bilingual" | "above" | "only" = "bilingual",
  targetLang = "zh",
): Promise<void> {
  await configureProviders(
    extension,
    [
      {
        id: "p_long",
        name: "Stub",
        endpoint: `${stub.origin}/v1/chat/completions`,
        model: "stub-model",
        secret: "sk-e2e-abcdef123456",
      },
    ],
    { ui: { targetLang, sourceLang: "en", displayMode } },
  );
}

async function translate(pageName: string): Promise<{ page: Awaited<ReturnType<typeof extension.openPage>>; url: string }> {
  const url = `${stub.origin}/pages/${pageName}`;
  const page = await extension.openPage(url);
  await waitForContentScript(page);
  await sendToTab(extension, url, { type: "translatePage" });
  await waitForTranslation(page, 2);
  await expect.poll(async () => (await jobStatus(extension, url)).state, { timeout: 30_000 }).toBe("completed");
  return { page, url };
}

function translationRequestCount(): number {
  return stub.requests.filter(
    (request) => request.method === "POST" && request.path.endsWith("/v1/chat/completions"),
  ).length;
}

// Measured on the pre-fix build; the fix must not change it (SC-006).
const CAPTURED_REQUESTS = 1;

test("the captured abstract is one complete passage in source order", async () => {
  await configure();
  const { page, url } = await translate(CAPTURED_PAGE);

  expect(translationRequestCount()).toBe(CAPTURED_REQUESTS);

  const rendered = await page.evaluate(() => {
    const source = document.querySelector("p.abstract") as HTMLElement | null;
    const container = (source?.nextElementSibling ?? null) as HTMLElement | null;
    const unit = source?.getAttribute("data-ipt-unit") ?? null;
    return {
      sourceText: source?.textContent ?? "",
      targetText: container?.getAttribute("data-ipt") === "target" ? (container.textContent ?? "") : "",
      siblingTargets: Array.from(source?.parentElement?.children ?? []).filter(
        (element) =>
          element.getAttribute("data-ipt") === "target" &&
          unit !== null &&
          element.getAttribute("data-ipt-unit") === unit,
      ).length,
      totalTargets: document.querySelectorAll('[data-ipt="target"]').length,
    };
  });

  expect(rendered.siblingTargets).toBe(1);
  const source = rendered.sourceText.replace(/\s+/gu, " ").trim();
  const target = rendered.targetText.replaceAll(PREFIX, "").replace(/\s+/gu, " ").trim();
  expect(target).toBe(source);
  expect(rendered.targetText).toContain(PREFIX);

  const status = await jobStatus(extension, url);
  expect(status.counts.translated).toBeGreaterThanOrEqual(4);

  await restorePage(extension, url);
  await expectNoResidue(page);
});

test("the authored page renders the abstract and the short block once each", async () => {
  await configure();
  const { page } = await translate(AUTHORED_PAGE);

  const counts = await page.evaluate(() => ({
    targets: document.querySelectorAll('[data-ipt="target"]').length,
    longPassage: Array.from(document.querySelectorAll('[data-ipt="target"]')).filter((element) =>
      (element.textContent ?? "").includes("Harbour authorities across the northern coast"),
    ).length,
  }));
  expect(counts.longPassage).toBe(1);
  expect(counts.targets).toBe(8);
});

test("translation-only shows the whole abstract, and restore is exact", async () => {
  await configure("only");
  const { page, url } = await translate(CAPTURED_PAGE);

  const rendered = await page.evaluate(() => {
    const source = document.querySelector("p.abstract") as HTMLElement | null;
    return {
      hidden: source?.hasAttribute("hidden") ?? false,
      display: source?.style.display ?? "",
      sourceText: source?.textContent ?? "",
      targetText: source?.nextElementSibling?.getAttribute("data-ipt") === "target"
        ? (source.nextElementSibling.textContent ?? "")
        : "",
    };
  });

  expect(rendered.hidden).toBe(true);
  expect(rendered.display).toBe("none");
  const source = rendered.sourceText.replace(/\s+/gu, " ").trim();
  const target = rendered.targetText.replaceAll(PREFIX, "").replace(/\s+/gu, " ").trim();
  expect(target).toBe(source);

  await restorePage(extension, url);
  await expectNoResidue(page);
  const restored = await page.evaluate(() => {
    const element = document.querySelector("p.abstract") as HTMLElement | null;
    return { hidden: element?.hasAttribute("hidden") ?? true, display: element?.style.display ?? "set" };
  });
  expect(restored.hidden).toBe(false);
  expect(restored.display).toBe("");
});


test("late long content renders complete exactly once", async () => {
  await configure();
  const { page } = await translate(AUTHORED_PAGE);
  const before = await page.locator('[data-ipt="target"]').count();

  const lateText =
    "Late harbour dispatches describe a second season of toll books, when the clerk was asked to reconcile two ledgers that had been kept in different rooms for a decade. " +
    "The columns did not agree, and the harbourmaster ordered a third ledger rather than choose between them, so the record of trade grew by one more careful hand.";
  await page.evaluate((text) => {
    const paragraph = document.createElement("p");
    paragraph.id = "late-arrival";
    paragraph.textContent = text;
    document.querySelector("main")?.appendChild(paragraph);
  }, lateText);

  // Feature 007 (FR-018): arriving is not a reason to pay for a translation — the demand window it
  // enters is. The reader scrolls to the new passage, and only then is it requested.
  await page.evaluate(() => document.querySelector("#late-arrival")?.scrollIntoView({ block: "center" }));
  await expect.poll(async () => page.locator('[data-ipt="target"]').count(), { timeout: 30_000 }).toBe(before + 1);
  const late = await page.evaluate(() => {
    const source = document.querySelector("#late-arrival") as HTMLElement | null;
    return {
      sourceText: source?.textContent ?? "",
      targetText: source?.nextElementSibling?.getAttribute("data-ipt") === "target"
        ? (source.nextElementSibling.textContent ?? "")
        : "",
      containers: Array.from(source?.parentElement?.children ?? []).filter(
        (element) =>
          element.getAttribute("data-ipt") === "target" &&
          element.getAttribute("data-ipt-unit") === source?.getAttribute("data-ipt-unit"),
      ).length,
    };
  });
  expect(late.containers).toBe(1);
  expect(late.targetText.replaceAll(PREFIX, "").replace(/\s+/gu, " ").trim()).toBe(
    late.sourceText.replace(/\s+/gu, " ").trim(),
  );
});

test("selection-only translation of a long block is complete and scoped", async () => {
  await configure();
  const url = `${stub.origin}/pages/${AUTHORED_PAGE}`;
  const page = await extension.openPage(url);
  await waitForContentScript(page);

  await page.evaluate(() => {
    const source = document.querySelector("p.abstract") as HTMLElement | null;
    const selection = window.getSelection();
    if (!source || !selection) return;
    const range = document.createRange();
    range.selectNodeContents(source);
    selection.removeAllRanges();
    selection.addRange(range);
  });

  await sendToTab(extension, url, { type: "translateSelection" });
  await waitForTranslation(page, 1);
  await expect.poll(async () => (await jobStatus(extension, url)).state, { timeout: 30_000 }).toBe("completed");

  const rendered = await page.evaluate(() => {
    const source = document.querySelector("p.abstract") as HTMLElement | null;
    return {
      targets: document.querySelectorAll('[data-ipt="target"]').length,
      sourceText: source?.textContent ?? "",
      targetText: source?.nextElementSibling?.getAttribute("data-ipt") === "target"
        ? (source.nextElementSibling.textContent ?? "")
        : "",
    };
  });
  expect(rendered.targets).toBe(1);
  expect(rendered.targetText.replaceAll(PREFIX, "").replace(/\s+/gu, " ").trim()).toBe(
    rendered.sourceText.replace(/\s+/gu, " ").trim(),
  );
});


test("the complete passage is one accessible element in the target language", async () => {
  await configure("only");
  const { page } = await translate(AUTHORED_PAGE);

  const shape = await page.evaluate(() => {
    const targets = Array.from(document.querySelectorAll('[data-ipt="target"]')) as HTMLElement[];
    const source = document.querySelector("p.abstract") as HTMLElement | null;
    const container = source?.nextElementSibling as HTMLElement | null;
    const find = (window as unknown as { find?: (text: string) => boolean }).find;
    return {
      allSingleElement: targets.every(
        (element) => element.tagName === "DIV" && element.children.length === 0,
      ),
      allTargetLanguage: targets.every((element) => element.getAttribute("lang") === "zh"),
      abstract: container?.textContent ?? "",
      // The prefix exists only in the translation, never in the source page.
      found: typeof find === "function" ? find("【译】") : null,
    };
  });

  expect(shape.allSingleElement).toBe(true);
  expect(shape.allTargetLanguage).toBe(true);
  expect(shape.abstract).toContain("readers are able to see");
  // window.find is Chromium's find API: the translated copy is locatable in translation-only mode.
  expect(shape.found).toBe(true);
});

test("the complete passage survives a narrow viewport, a longer translation and an RTL target", async () => {
  await stub.close();
  stub = await startStubProvider({
    staticDir: PAGES_DIR,
    translate: (text) => `${PREFIX}${text} ${"padding words ".repeat(Math.ceil(text.length * 0.3 / 14))}`,
  });
  await configure("bilingual");
  const url = `${stub.origin}/pages/${AUTHORED_PAGE}`;
  const page = await extension.openPage(url);
  await page.setViewportSize({ width: 400, height: 800 });
  await waitForContentScript(page);
  await sendToTab(extension, url, { type: "translatePage" });
  await waitForTranslation(page, 2);
  await expect.poll(async () => (await jobStatus(extension, url)).state, { timeout: 30_000 }).toBe("completed");

  const layout = await page.evaluate(() => {
    const containers = Array.from(document.querySelectorAll('[data-ipt="target"]')) as HTMLElement[];
    const boxes = containers.map((element) => element.getBoundingClientRect());
    let overlaps = 0;
    for (let left = 0; left < boxes.length; left += 1) {
      for (let right = left + 1; right < boxes.length; right += 1) {
        const a = boxes[left];
        const b = boxes[right];
        if (!a || !b) continue;
        const vertical = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        const horizontal = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        if (vertical > 1 && horizontal > 1) overlaps += 1;
      }
    }
    return {
      horizontalScroll: document.documentElement.scrollWidth > window.innerWidth + 1,
      overlaps,
    };
  });
  expect(layout.overlaps).toBe(0);
  expect(layout.horizontalScroll).toBe(false);

  await page.close();
  await configure("bilingual", "ar");
  const rtl = await extension.openPage(`${stub.origin}/pages/${AUTHORED_PAGE}`);
  await waitForContentScript(rtl);
  await sendToTab(extension, url, { type: "translatePage" });
  await waitForTranslation(rtl, 2);
  await expect.poll(async () => (await jobStatus(extension, url)).state, { timeout: 30_000 }).toBe("completed");
  const rtlShape = await rtl.evaluate(() => {
    const source = document.querySelector("p.abstract") as HTMLElement | null;
    const container = source?.nextElementSibling as HTMLElement | null;
    return {
      lang: container?.getAttribute("lang") ?? "",
      text: container?.textContent ?? "",
      source: source?.textContent ?? "",
    };
  });
  expect(rtlShape.lang).toBe("ar");
  expect(rtlShape.text.replaceAll(PREFIX, "").replace(/\s+/gu, " ").trim()).toContain(
    rtlShape.source.replace(/\s+/gu, " ").trim().slice(0, 120),
  );
});

