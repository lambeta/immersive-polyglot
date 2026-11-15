import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { launchWithExtension, type LaunchedExtension } from "../support/load-extension.js";
import { startStubProvider, type StubProvider } from "../support/stub-provider.js";
import {
  clickTranslate,
  configureProviders,
  jobStatus,
  maxTranslationsPerPassage,
  repeatCommand,
  selectPassage,
  sendToTab,
  translationTexts,
  translationsPerPassage,
  waitForContentScript,
  waitForTranslation,
} from "../support/e2e-fixtures.js";

/**
 * US1 (FR-001..FR-006, SC-001..SC-004): however often the reader activates translation, the page is
 * translated exactly once. Real Chromium, the unpacked extension, real chrome.storage, real HTTP to
 * the stub provider; every assertion reads the rendered page or the provider's request log.
 */

const PAGES_DIR = fileURLToPath(new URL("../fixtures/pages", import.meta.url));

let stub: StubProvider;
let extension: LaunchedExtension;

async function configure(targetLang = "zh", sourceLang = "en"): Promise<void> {
  await configureProviders(
    extension,
    [
      {
        id: "p_stub",
        name: "Stub",
        endpoint: `${stub.origin}/v1/chat/completions`,
        model: "stub-model",
        secret: "sk-e2e-abcdef123456",
      },
    ],
    { ui: { targetLang, sourceLang, displayMode: "bilingual" } },
  );
}

test.beforeEach(async () => {
  stub = await startStubProvider({ staticDir: PAGES_DIR });
  extension = await launchWithExtension();
  await configure();
});

test.afterEach(async () => {
  await extension.close();
  await stub.close();
});

/** Samples the per-passage translation count every 100 ms inside the page (SC-003). */
async function startSampling(page: import("@playwright/test").Page): Promise<void> {
  await page.evaluate(() => {
    const host = window as unknown as { __iptPeak?: number; __iptTimer?: number };
    host.__iptPeak = 0;
    host.__iptTimer = window.setInterval(() => {
      const sources = Array.from(document.querySelectorAll('[data-ipt="source"]'));
      let peak = 0;
      for (const source of sources) {
        let count = source.querySelectorAll('[data-ipt="target"]').length;
        const next = source.nextElementSibling;
        if (next && next.getAttribute("data-ipt") === "target") {
          let node: Element | null = next;
          while (node && node.getAttribute("data-ipt") === "target") {
            if (node.getAttribute("data-ipt-position") !== "before") count += 1;
            node = node.nextElementSibling;
          }
        }
        const previous = source.previousElementSibling;
        if (previous && previous.getAttribute("data-ipt") === "target") {
          let node: Element | null = previous;
          while (node && node.getAttribute("data-ipt") === "target") {
            if (node.getAttribute("data-ipt-position") === "before") count += 1;
            node = node.previousElementSibling;
          }
        }
        peak = Math.max(peak, count);
      }
      host.__iptPeak = Math.max(host.__iptPeak ?? 0, peak);
    }, 100) as unknown as number;
  });
}

async function stopSampling(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate(() => {
    const host = window as unknown as { __iptPeak?: number; __iptTimer?: number };
    if (host.__iptTimer !== undefined) window.clearInterval(host.__iptTimer);
    return host.__iptPeak ?? 0;
  });
}

async function waitForState(url: string, state: string): Promise<void> {
  await expect.poll(async () => (await jobStatus(extension, url)).state, { timeout: 30_000 }).toBe(state);
}

test("five activations in one second translate each passage once, over 20 trials", async () => {
  test.setTimeout(300_000);
  const url = `${stub.origin}/pages/news-article-a.html`;

  // Baseline: one activation on a fresh page, recorded as the expected translation set.
  const baselinePage = await extension.openPage(url);
  await waitForContentScript(baselinePage);
  await sendToTab(extension, url, { type: "translatePage" });
  await waitForTranslation(baselinePage, 1);
  await waitForState(url, "completed");
  const baseline = await translationTexts(baselinePage);
  await baselinePage.close();
  expect(baseline.length).toBeGreaterThan(0);
  const singleRunRequests = stub.requests.length;

  for (let trial = 1; trial <= 20; trial += 1) {
    const page = await extension.openPage(url);
    await waitForContentScript(page);
    await startSampling(page);

    await repeatCommand(extension, url, { type: "translatePage" }, 5);
    await waitForTranslation(page, baseline.length);
    await waitForState(url, "completed");

    const peak = await stopSampling(page);
    expect(peak, `trial ${trial}: a passage showed two translations`).toBeLessThanOrEqual(1);

    const perPassage = await translationsPerPassage(page);
    expect(perPassage.length).toBeGreaterThan(0);
    for (const entry of perPassage) {
      expect(entry.count, `trial ${trial}: ${entry.passage}`).toBe(1);
    }

    const texts = await translationTexts(page);
    expect(texts.slice().sort(), `trial ${trial}`).toEqual(baseline.slice().sort());
    await page.close();
  }

  // Five activations per trial must never multiply the provider traffic (SC-002).
  expect(stub.requests.length).toBe(singleRunRequests * 21);
});

test("a second burst of five after completion still leaves one translation per passage", async () => {
  const url = `${stub.origin}/pages/news-article-a.html`;
  const page = await extension.openPage(url);
  await waitForContentScript(page);

  await repeatCommand(extension, url, { type: "translatePage" }, 5);
  await waitForTranslation(page, 1);
  await waitForState(url, "completed");
  const first = await translationTexts(page);
  const requestsAfterFirst = stub.requests.length;

  await repeatCommand(extension, url, { type: "translatePage" }, 5);
  await page.waitForTimeout(700);

  expect((await translationTexts(page)).slice().sort()).toEqual(first.slice().sort());
  for (const entry of await translationsPerPassage(page)) expect(entry.count).toBe(1);
  expect(stub.requests.length).toBe(requestsAfterFirst);
});

test("container-tag pages never show a passage twice", async () => {
  for (const fixture of ["forum-thread.html", "docs-table.html"]) {
    const url = `${stub.origin}/pages/${fixture}`;
    const page = await extension.openPage(url);
    await waitForContentScript(page);
    await startSampling(page);

    await repeatCommand(extension, url, { type: "translatePage" }, 5);
    await waitForTranslation(page, 1);
    await waitForState(url, "completed");

    expect(await stopSampling(page), `${fixture}: transient duplicate`).toBeLessThanOrEqual(1);
    for (const entry of await translationsPerPassage(page)) {
      expect(entry.count, `${fixture}: ${entry.passage}`).toBe(1);
    }
    const texts = await translationTexts(page);
    expect(texts.length).toBeGreaterThan(0);
    // Repeated source text is reused by design (feature 001), so equal texts are fine; what must
    // never happen is one passage carrying two translations.
    expect(await maxTranslationsPerPassage(page)).toBe(1);
    await page.close();
  }
});

test("the reader's own action — five presses on the popup control — translates once", async () => {
  const url = `${stub.origin}/pages/news-article-a.html`;
  const page = await extension.openPage(url);
  await waitForContentScript(page);

  // The reader has the page in front of them when they open the panel. Opened as a tab in this
  // harness, the panel must be pointed at that page and then booted with it active.
  const popup = await extension.context.newPage();
  await popup.goto(extension.popupUrl);
  await page.bringToFront();
  await popup.reload();
  await popup.locator("#translate").waitFor();
  await expect(popup.locator("#site-host")).toContainText("127.0.0.1");
  await clickTranslate(popup, 5);

  await waitForTranslation(page, 1);
  await waitForState(url, "completed");

  for (const entry of await translationsPerPassage(page)) expect(entry.count).toBe(1);
  expect(await maxTranslationsPerPassage(page)).toBe(1);
  await popup.close();
});

test("late content between presses is translated exactly once", async () => {
  const url = `${stub.origin}/pages/news-article-a.html`;
  const page = await extension.openPage(url);
  await waitForContentScript(page);

  await repeatCommand(extension, url, { type: "translatePage" }, 2);
  await page.evaluate(() => {
    const article = document.querySelector("article") ?? document.body;
    const paragraph = document.createElement("p");
    paragraph.id = "injected-passage";
    paragraph.textContent =
      "the harbour records describe cargo moving inland by barge and the toll books list every crossing";
    article.append(paragraph);
  });
  await repeatCommand(extension, url, { type: "translatePage" }, 2);
  await waitForTranslation(page, 1);
  await waitForState(url, "completed");
  await page.waitForTimeout(800);

  const injected = page.locator("#injected-passage");
  const beside = await injected.evaluate((element) => {
    let count = element.querySelectorAll('[data-ipt="target"]').length;
    let node = element.nextElementSibling;
    while (node && node.getAttribute("data-ipt") === "target") {
      count += 1;
      node = node.nextElementSibling;
    }
    return count;
  });
  expect(beside).toBe(1);
  const texts = await translationTexts(page);
  expect(texts.filter((text) => text.includes("barge")).length).toBe(1);
});

test("presentation changes between presses keep one translation per passage", async () => {
  const url = `${stub.origin}/pages/news-article-a.html`;
  const page = await extension.openPage(url);
  await waitForContentScript(page);

  await repeatCommand(extension, url, { type: "translatePage" }, 2);
  await sendToTab(extension, url, { type: "setDisplayMode", mode: "above" });
  await sendToTab(extension, url, { type: "setDisplayStyle", style: "marker" });
  await repeatCommand(extension, url, { type: "translatePage" }, 3);
  await waitForTranslation(page, 1);
  await waitForState(url, "completed");

  for (const entry of await translationsPerPassage(page)) expect(entry.count).toBe(1);
  const targets = page.locator('[data-ipt="target"]');
  const styles = await targets.evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("data-ipt-style")),
  );
  expect(new Set(styles).size).toBe(1);
  expect(styles[0]).toBe("marker");
});

test("a page already in the target language stays skipped when pressed again", async () => {
  await configure("zh", "auto");
  const url = `${stub.origin}/pages/news-zh.html`;
  const page = await extension.openPage(url);
  await waitForContentScript(page);

  await repeatCommand(extension, url, { type: "translatePage" }, 5);
  await page.waitForTimeout(1500);

  const status = await jobStatus(extension, url);
  expect(status.counts.translated).toBe(0);
  expect(await page.locator('[data-ipt="target"]').count()).toBe(0);
  expect(stub.requests.length).toBe(0);
});

test("a selection requested during a whole-page run is absorbed", async () => {
  stub.setMode("success", { latencyMs: 2500 });
  const url = `${stub.origin}/pages/news-article-a.html`;
  const page = await extension.openPage(url);
  await waitForContentScript(page);

  await sendToTab(extension, url, { type: "translatePage" });
  // Ask for a selection while the first batch is still on the wire.
  await selectPassage(page, "article p");
  const reply = await sendToTab(extension, url, { type: "translateSelection" });
  expect(reply).toMatchObject({ ok: true, absorbed: true });

  await waitForState(url, "completed");
  await page.waitForTimeout(500);
  for (const entry of await translationsPerPassage(page)) expect(entry.count).toBe(1);
  expect(await maxTranslationsPerPassage(page)).toBe(1);
});
// ---------------------------------------------------------------------------------------------
// US2 (FR-008, FR-010..FR-012, SC-005, SC-009): turning translation off still returns the page.
// ---------------------------------------------------------------------------------------------

test("turning translation off after five activations restores the page exactly", async () => {
  const url = `${stub.origin}/pages/news-article-a.html`;
  const page = await extension.openPage(url);
  await waitForContentScript(page);
  await page.evaluate(() => window.scrollTo(0, 240));
  const before = await page.evaluate(() => ({
    html: document.body.innerHTML,
    scrollY: window.scrollY,
  }));

  await repeatCommand(extension, url, { type: "translatePage" }, 5);
  await waitForTranslation(page, 1);
  await waitForState(url, "completed");

  // The restore promise is that the reader's place is kept: capture it where they are when they
  // press, not where they were before the page grew.
  const scrollAtTurnOff = await page.evaluate(() => window.scrollY);
  await sendToTab(extension, url, { type: "toggleTranslation" });
  await expect.poll(() => page.locator("[data-ipt]").count(), { timeout: 10_000 }).toBe(0);
  const after = await page.evaluate(() => ({
    html: document.body.innerHTML,
    scrollY: window.scrollY,
    maxScroll: Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
  }));

  expect(after.html).toBe(before.html);
  // The removal shortens the page, so the reader keeps their place as far as the restored height
  // allows — never further, and never arbitrarily.
  expect(Math.abs(after.scrollY - Math.min(scrollAtTurnOff, after.maxScroll))).toBeLessThanOrEqual(1);
});

test("turning translation off mid-run leaves nothing behind", async () => {
  stub.setMode("success", { latencyMs: 1200 });
  const url = `${stub.origin}/pages/news-article-a.html`;
  const page = await extension.openPage(url);
  await waitForContentScript(page);

  await sendToTab(extension, url, { type: "translatePage" });
  await waitForTranslation(page, 1);
  await sendToTab(extension, url, { type: "toggleTranslation" });
  await page.waitForTimeout(2500);

  expect(await page.locator("[data-ipt]").count()).toBe(0);
  expect((await jobStatus(extension, url)).state).toBe("idle");
});

test("a selection replaces a displayed whole page without ever holding two sets", async () => {
  const url = `${stub.origin}/pages/news-article-a.html`;
  const page = await extension.openPage(url);
  await waitForContentScript(page);
  await sendToTab(extension, url, { type: "translatePage" });
  await waitForState(url, "completed");

  await selectPassage(page, "article p");
  const reply = await sendToTab(extension, url, { type: "translateSelection" });
  expect(reply).toMatchObject({ ok: true });
  await waitForState(url, "completed");

  for (const entry of await translationsPerPassage(page)) expect(entry.count).toBeLessThanOrEqual(1);
  expect(await maxTranslationsPerPassage(page)).toBe(1);

  await sendToTab(extension, url, { type: "toggleTranslation" });
  await expect.poll(() => page.locator("[data-ipt]").count(), { timeout: 10_000 }).toBe(0);
});

test("a selection-only run followed by a whole-page press ends with one translation each", async () => {
  const url = `${stub.origin}/pages/news-article-a.html`;
  const page = await extension.openPage(url);
  await waitForContentScript(page);

  await selectPassage(page, "article p");
  await sendToTab(extension, url, { type: "translateSelection" });
  await waitForState(url, "completed");
  const afterSelection = await page.locator('[data-ipt="target"]').count();
  expect(afterSelection).toBeGreaterThan(0);

  await sendToTab(extension, url, { type: "translatePage" });
  await waitForState(url, "completed");

  const perPassage = await translationsPerPassage(page);
  expect(perPassage.length).toBeGreaterThan(0);
  for (const entry of perPassage) expect(entry.count, entry.passage).toBe(1);

  await sendToTab(extension, url, { type: "toggleTranslation" });
  await expect.poll(() => page.locator("[data-ipt]").count(), { timeout: 10_000 }).toBe(0);
});

// ---------------------------------------------------------------------------------------------
// US3 (FR-006, FR-009, FR-013, FR-014, FR-020; SC-006..SC-008, SC-010, SC-012): cost and reach.
// ---------------------------------------------------------------------------------------------

test("five activations cost exactly one run of requests, counts and usage", async () => {
  const url = `${stub.origin}/pages/news-article-a.html`;

  const singlePage = await extension.openPage(url);
  await waitForContentScript(singlePage);
  stub.reset();
  await sendToTab(extension, url, { type: "translatePage" });
  await waitForState(url, "completed");
  const singleRequests = stub.requests.length;
  const singleStatus = await jobStatus(extension, url);
  await singlePage.close();

  const repeatPage = await extension.openPage(url);
  await waitForContentScript(repeatPage);
  stub.reset();
  await repeatCommand(extension, url, { type: "translatePage" }, 5);
  await waitForState(url, "completed");
  await repeatPage.waitForTimeout(500);

  expect(stub.requests.length).toBe(singleRequests);
  expect((await jobStatus(extension, url)).counts).toEqual(singleStatus.counts);
});

test("ten activations during a failing run report one failure", async () => {
  stub.setMode("serverError");
  const url = `${stub.origin}/pages/news-article-a.html`;

  // Baseline first, on its own tab: one activation against the same failing provider, whose retry
  // ladder issues more than one HTTP request.
  const baselinePage = await extension.openPage(url);
  await waitForContentScript(baselinePage);
  const beforeBaseline = stub.requests.length;
  await sendToTab(extension, url, { type: "translatePage" });
  await expect.poll(async () => (await jobStatus(extension, url)).failure?.errorClass, { timeout: 30_000 })
    .toBe("serverError");
  const singleRunRequests = stub.requests.length - beforeBaseline;
  await baselinePage.close();
  expect(singleRunRequests).toBeGreaterThan(0);

  const page = await extension.openPage(url);
  await waitForContentScript(page);
  const beforeRepeat = stub.requests.length;
  await repeatCommand(extension, url, { type: "translatePage" }, 10);
  await expect.poll(async () => (await jobStatus(extension, url)).failure?.errorClass, { timeout: 30_000 })
    .toBe("serverError");
  await page.waitForTimeout(800);

  const status = await jobStatus(extension, url);
  expect(status.state).toBe("failed");
  expect(page.locator("#failure")).toHaveCount(0);

  // Ten presses must cost exactly one attempt.
  expect(stub.requests.length - beforeRepeat).toBe(singleRunRequests);
});

test("ten activations on a capped run give one cap notice", async () => {
  await configureProviders(
    extension,
    [
      {
        id: "p_stub",
        name: "Stub",
        endpoint: `${stub.origin}/v1/chat/completions`,
        model: "stub-model",
        secret: "sk-e2e-abcdef123456",
      },
    ],
    { limits: { maxConcurrency: 2, sessionCapSegments: 3, sessionCapChars: 0, siteCaps: {} } },
  );
  const url = `${stub.origin}/pages/news-article-a.html`;
  const page = await extension.openPage(url);
  await waitForContentScript(page);

  await repeatCommand(extension, url, { type: "translatePage" }, 10);
  await waitForState(url, "completed");
  await page.waitForTimeout(500);

  const status = await jobStatus(extension, url);
  expect(status.capReached).toBe(true);
  expect(status.counts.translated).toBeLessThanOrEqual(3);
  expect(stub.requests.length).toBeLessThanOrEqual(1);
});

test("ten activations with no provider report once and request nothing", async () => {
  await configureProviders(extension, [], { routing: { defaultProviderId: null, rules: [] } });
  const url = `${stub.origin}/pages/news-article-a.html`;
  const page = await extension.openPage(url);
  await waitForContentScript(page);

  await repeatCommand(extension, url, { type: "translatePage" }, 10);
  await expect
    .poll(async () => (await jobStatus(extension, url)).failure?.errorClass, { timeout: 20_000 })
    .toBe("providerMissing");
  await page.waitForTimeout(500);

  expect(stub.requests.length).toBe(0);
  expect(await page.locator('[data-ipt="target"]').count()).toBe(0);
});

test("five activations on a long page stay within 5% of one", async () => {
  test.setTimeout(180_000);
  const url = `${stub.origin}/pages/article-long.html`;

  const measure = async (times: number): Promise<number> => {
    const page = await extension.openPage(url);
    await waitForContentScript(page);
    const started = Date.now();
    await repeatCommand(extension, url, { type: "translatePage" }, times);
    await expect.poll(async () => (await jobStatus(extension, url)).state, { timeout: 120_000 }).toBe(
      "completed",
    );
    const elapsed = Date.now() - started;
    await page.close();
    return elapsed;
  };

  const single = await measure(1);
  const repeated = await measure(5);
  expect(repeated).toBeLessThanOrEqual(single * 1.05 + 1000);
});

test("two tabs stay independent and a run announces itself once", async () => {
  const first = `${stub.origin}/pages/news-article-a.html`;
  const second = `${stub.origin}/pages/blog-post.html`;
  const firstPage = await extension.openPage(first);
  const secondPage = await extension.openPage(second);
  await waitForContentScript(firstPage);
  await waitForContentScript(secondPage);

  await Promise.all([
    repeatCommand(extension, first, { type: "translatePage" }, 3),
    repeatCommand(extension, second, { type: "translatePage" }, 3),
  ]);
  await waitForState(first, "completed");
  await waitForState(second, "completed");

  for (const [url, page] of [[first, firstPage], [second, secondPage]] as const) {
    for (const entry of await translationsPerPassage(page)) expect(entry.count, url).toBe(1);
  }

  const popup = await extension.context.newPage();
  await popup.goto(extension.popupUrl);
  const status = popup.locator("#status");
  await expect(status).toHaveAttribute("role", "status");
  await expect(status).toHaveAttribute("aria-live", "polite");
  await popup.locator("#translate").focus();
  await popup.keyboard.press("Enter");
  await popup.waitForTimeout(500);
  await expect(popup.locator("#translate")).toBeFocused();
  await popup.close();
});
