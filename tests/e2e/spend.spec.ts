import { expect, test, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { launchWithExtension, type LaunchedExtension } from "../support/load-extension.js";
import { startStubProvider, type StubProvider } from "../support/stub-provider.js";
import {
  configureProviders,
  jobStatus,
  sendToTab,
  waitForContentScript,
  waitForTranslation,
} from "../support/e2e-fixtures.js";

/**
 * Feature 008, T14: the spend row on a real translated page, over the real wire. The priced
 * provider's host is resolved to the local stub, so the arithmetic is exercised end to end.
 */

const PAGES_DIR = fileURLToPath(new URL("../fixtures/pages", import.meta.url));

let stub: StubProvider;
let extension: LaunchedExtension;

test.beforeEach(async () => {
  stub = await startStubProvider({ staticDir: PAGES_DIR, usage: "deepseek" });
  extension = await launchWithExtension();
});

test.afterEach(async () => {
  await extension.close();
  await stub.close();
});

/** The priced provider: the catalogue's host, resolved to the local stub by the test browser. */
function pricedEndpoint(): string {
  const port = new URL(stub.origin).port;
  return `http://api.deepseek.com:${port}/v1/chat/completions`;
}

async function seedPricedProvider(): Promise<void> {
  await configureProviders(extension, [
    {
      id: "p_spend",
      name: "DeepSeek",
      endpoint: pricedEndpoint(),
      model: "deepseek-flash",
      secret: "sk-e2e-spend-1234",
      timeoutMs: 8_000,
    },
  ]);
}

async function openPanel(): Promise<Page> {
  const popup = await extension.context.newPage();
  await popup.setViewportSize({ width: 384, height: 720 });
  await popup.goto(extension.popupUrl, { waitUntil: "domcontentloaded" });
  // Attached, not visible: an empty record is intentionally hidden by `:has(#usage:empty)`.
  await popup.waitForSelector("#usage", { state: "attached" });
  return popup;
}

async function translate(url: string): Promise<{ page: Page }> {
  const page = await extension.openPage(url);
  await waitForContentScript(page);
  await page.bringToFront();
  await sendToTab(extension, url, { type: "translatePage" });
  return { page };
}

function expectedAmounts(requestCount: number): number[] {
  return [requestCount * 0.00308, requestCount * 0.00616];
}


test("the panel reports the tokens and the price of a translated page", async () => {
  await seedPricedProvider();
  const url = `${stub.origin}/pages/news-article-a.html`;
  const { page } = await translate(url);
  await waitForTranslation(page, 1);

  const status = await jobStatus(extension, url);
  const spend = status.usage?.spend;
  const requests = stub.requests.length;
  expect(requests).toBeGreaterThan(0);
  expect(spend?.tokens.total).toBe(requests * 5_500);
  expect(spend?.price?.currency).toBe("CNY");
  expect(spend?.price?.snapshot).toBe("2026-11");
  const [offPeak, peak] = expectedAmounts(requests);
  const amount = spend?.price?.amount ?? -1;
  expect(Math.abs(amount - (offPeak ?? 0)) < 1e-9 || Math.abs(amount - (peak ?? 0)) < 1e-9).toBe(true);

  const popup = await openPanel();
  const text = (await popup.locator("#usage").textContent()) ?? "";
  expect(text).toContain(`${(requests * 5_500).toLocaleString("en")} tokens spent`);
  expect(text).toContain("≈ ¥");
  expect(text).toContain("DeepSeek · 2026-11");

  await popup.reload();
  await popup.waitForSelector("#usage .usage__spend");
  expect((await popup.locator("#usage").textContent()) ?? "").toBe(text);
  await popup.close();
});

test("a profile that still says deepseek-chat is priced, not refused", async () => {
  await configureProviders(extension, [
    {
      id: "p_legacy",
      name: "DeepSeek",
      endpoint: pricedEndpoint(),
      model: "deepseek-chat",
      secret: "sk-e2e-legacy-1234",
      timeoutMs: 8_000,
    },
  ]);
  const url = `${stub.origin}/pages/news-article-a.html`;
  const { page } = await translate(url);
  await waitForTranslation(page, 1);

  const status = await jobStatus(extension, url);
  expect(status.usage?.spend?.price?.currency).toBe("CNY");
  expect(status.usage?.spend?.unavailable).toBeUndefined();

  const popup = await openPanel();
  const text = (await popup.locator("#usage").textContent()) ?? "";
  expect(text).toContain("≈ ¥");
  expect(text).not.toContain("No published price");
  await popup.close();
});

test("twenty arrivals each reach both figures within a second, and neither falls", async () => {
  await seedPricedProvider();
  stub.setMode("success", { latencyMs: 120 });
  const url = `${stub.origin}/pages/article-endless.html`;
  const page = await extension.openPage(url);
  await waitForContentScript(page);
  await page.bringToFront();

  // The arrival clock lives in the page, so every instant is the same wall clock the panel reads.
  await page.evaluate(() => {
    const clock = window as unknown as { __arrivals?: number[] };
    clock.__arrivals = [];
    let seen = document.querySelectorAll('[data-ipt="target"]').length;
    const timer = window.setInterval(() => {
      const now = document.querySelectorAll('[data-ipt="target"]').length;
      while (seen < now) {
        clock.__arrivals?.push(Date.now());
        seen += 1;
      }
      if (seen >= 20) window.clearInterval(timer);
    }, 20);
  });

  const popup = await openPanel();
  const translation = sendToTab(extension, url, { type: "translatePage" });

  interface Sample {
    at: number;
    tokens: number;
    price: string;
  }
  const samples: Sample[] = [];
  const sampleOnce = async (): Promise<void> => {
    const tokensText = await popup.locator("#usage .usage__tokens").textContent().catch(() => null);
    const priceText = await popup.locator("#usage .usage__price").textContent().catch(() => null);
    if (tokensText === null || priceText === null) return;
    samples.push({
      at: Date.now(),
      tokens: Number(tokensText.replace(/[^0-9]/gu, "")),
      price: priceText,
    });
  };
  const readArrivals = async (): Promise<number[]> =>
    page.evaluate(() =>
      ((window as unknown as { __arrivals?: number[] }).__arrivals ?? []).slice(),
    );

  let arrivals: number[] = [];
  let ticks = 0;
  const deadline = Date.now() + 60_000;
  while (arrivals.length < 20 && Date.now() < deadline) {
    arrivals = await readArrivals();
    await sampleOnce();
    // Reading on feeds the demand window: a screenful at a time, the way a reader scrolls.
    ticks += 1;
    if (ticks % 8 === 0) await page.evaluate(() => window.scrollBy(0, 400));
    await page.waitForTimeout(25);
  }
  // Keep sampling for a second after the twentieth arrival: SC-008's bound is measured from the
  // arrival, so its own reflection must be inside the window too.
  const settle = Date.now() + 1_500;
  while (Date.now() < settle) {
    await sampleOnce();
    await page.waitForTimeout(25);
  }
  await translation;

  expect(arrivals.length).toBeGreaterThanOrEqual(20);
  expect(samples.length).toBeGreaterThan(2);

  const first = samples[0];
  const last = samples[samples.length - 1];
  if (!first || !last) throw new Error("no samples");
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    if (!previous || !current) continue;
    expect(current.tokens, "the token figure never falls").toBeGreaterThanOrEqual(previous.tokens);
  }
  expect(last.tokens).toBeGreaterThan(first.tokens);
  expect(last.price).not.toBe(first.price);

  // SC-008: each of the twenty arrivals is reflected in both figures within one second.
  // The baseline is taken a moment before the arrival (the page stamps an arrival within one poll
  // of seeing it, and the panel is sampled independently), so a rise cannot be mistaken for the
  // state the arrival started from.
  const GRACE_MS = 250;
  const WINDOW_MS = 1_000;
  for (const arrival of arrivals.slice(0, 20)) {
    const before = samples.filter((sample) => sample.at <= arrival - GRACE_MS).at(-1);
    const baseTokens = before?.tokens ?? 0;
    const basePrice = before?.price ?? "";
    const tokenRise = samples.find((sample) => sample.at >= arrival && sample.tokens > baseTokens);
    const priceRise = samples.find(
      (sample) => sample.at >= arrival && sample.price !== basePrice && sample.price.length > 0,
    );
    expect(tokenRise, `token figure after the arrival at ${arrival}`).toBeDefined();
    expect(priceRise, `price after the arrival at ${arrival}`).toBeDefined();
    expect((tokenRise?.at ?? Number.POSITIVE_INFINITY) - arrival).toBeLessThanOrEqual(WINDOW_MS);
    expect((priceRise?.at ?? Number.POSITIVE_INFINITY) - arrival).toBeLessThanOrEqual(WINDOW_MS);
  }
  await popup.close();
});

test("turning translation off clears the row; a cancel keeps it", async () => {
  await seedPricedProvider();
  stub.setMode("success", { latencyMs: 150 });
  const url = `${stub.origin}/pages/news-article-a.html`;
  const { page } = await translate(url);
  await waitForTranslation(page, 1);

  await sendToTab(extension, url, { type: "cancelJob" });
  await page.waitForTimeout(300);

  const popup = await openPanel();
  await expect(popup.locator("#usage .usage__spend")).toHaveCount(1);

  await sendToTab(extension, url, { type: "toggleTranslation" });
  await page.waitForFunction(() => document.querySelectorAll("[data-ipt]").length === 0);

  await popup.reload();
  await popup.waitForSelector("#usage", { state: "attached" });
  await expect(popup.locator("#usage .usage__spend")).toHaveCount(0);
  await expect(popup.locator(".usage")).toBeHidden();
  await popup.close();
});
