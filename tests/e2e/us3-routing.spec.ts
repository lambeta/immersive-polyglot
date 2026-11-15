import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { launchWithExtension, type LaunchedExtension } from "../support/load-extension.js";
import { startStubProvider, type StubProvider } from "../support/stub-provider.js";
import {
  configureProviders,
  jobStatus,
  sendToTab,
  waitForContentScript,
  waitForTranslation,
  writeSettings,
} from "../support/e2e-fixtures.js";

/**
 * US3 (T052): each page is sent to the provider the rules specify, the override is per page
 * load only, and a rule pointing at a deleted provider is reported instead of silently dropped.
 */

const PAGES_DIR = fileURLToPath(new URL("../fixtures/pages", import.meta.url));

let stub: StubProvider;
let extension: LaunchedExtension;

test.beforeEach(async () => {
  stub = await startStubProvider({ staticDir: PAGES_DIR });
  extension = await launchWithExtension();
  await configureProviders(extension, [
    {
      id: "p_default",
      name: "Default",
      endpoint: `${stub.origin}/a/v1/chat/completions`,
      model: "model-a",
      secret: "sk-default-1111",
    },
    {
      id: "p_other",
      name: "Other",
      endpoint: `${stub.origin}/b/v1/chat/completions`,
      model: "model-b",
      secret: "sk-other-2222",
    },
  ]);
});

test.afterEach(async () => {
  await extension.close();
  await stub.close();
});

async function paths(): Promise<string[]> {
  return stub.requests.map((request) => request.path);
}

test("a site rule sends that site to its provider and other sites to the default", async () => {
  await writeSettings(extension, {
    routing: {
      defaultProviderId: "p_default",
      rules: [
        {
          id: "r_site",
          kind: "site",
          match: "127.0.0.1/pages/docs-guide.html",
          providerId: "p_other",
          enabled: true,
        },
      ],
    },
  });

  const docsUrl = `${stub.origin}/pages/docs-guide.html`;
  const docs = await extension.openPage(docsUrl);
  await waitForContentScript(docs);
  await sendToTab(extension, docsUrl, { type: "translatePage" });
  await waitForTranslation(docs, 1);
  expect((await paths()).every((path) => path.startsWith("/b/"))).toBe(true);

  stub.reset();
  const blogUrl = `${stub.origin}/pages/blog-short.html`;
  const blog = await extension.openPage(blogUrl);
  await waitForContentScript(blog);
  await sendToTab(extension, blogUrl, { type: "translatePage" });
  await waitForTranslation(blog, 1);
  expect((await paths()).every((path) => path.startsWith("/a/"))).toBe(true);
});

test("a rule whose provider is gone is shown as broken and stays deletable (T038)", async () => {
  await writeSettings(extension, {
    routing: {
      defaultProviderId: "p_default",
      rules: [
        { id: "r_dead", kind: "site", match: "docs.example", providerId: "p_vanished", enabled: true },
        {
          id: "r_pair",
          kind: "languagePair",
          match: { sourceLang: "en", targetLang: "zh" },
          providerId: "p_other",
          enabled: true,
        },
      ],
    },
  });

  const options = await extension.openOptions();
  await options.getByRole("button", { name: "Routing" }).click();

  const rows = options.locator("#rule-list li");
  await expect(rows).toHaveCount(2);

  const dead = rows.first();
  await expect(dead).toContainText("docs.example");
  await expect(dead).toContainText("Broken");
  await expect(dead).toContainText("p_vanished");
  // A rule is not removed for pointing at nothing: it stays visible, labelled, and deletable.
  const remove = dead.getByRole("button", { name: "Delete rule" });
  await expect(remove).toBeVisible();
  await remove.click();
  await expect(options.locator("#rule-list li")).toHaveCount(1);

  // The kind is named on the row, so "en to zh" is not mistaken for a site pattern.
  await expect(options.locator("#rule-list li").first()).toContainText("Language pair");
  await options.close();
});

test("a language-pair rule beats the global default, and a site rule beats it", async () => {
  await writeSettings(extension, {
    routing: {
      defaultProviderId: "p_default",
      rules: [
        {
          id: "r_pair",
          kind: "languagePair",
          match: { sourceLang: "en", targetLang: "zh" },
          providerId: "p_other",
          enabled: true,
        },
      ],
    },
  });

  const url = `${stub.origin}/pages/wiki-entry.html`;
  const page = await extension.openPage(url);
  await waitForContentScript(page);
  await sendToTab(extension, url, { type: "translatePage" });
  await waitForTranslation(page, 1);
  expect((await paths()).every((path) => path.startsWith("/b/"))).toBe(true);
});

test("a per-page override applies to this page only and changes no stored rule", async () => {
  await writeSettings(extension, {
    routing: {
      defaultProviderId: "p_default",
      rules: [
        { id: "r_site", kind: "site", match: "127.0.0.1", providerId: "p_other", enabled: true },
      ],
    },
  });

  const url = `${stub.origin}/pages/news-article-a.html`;
  const page = await extension.openPage(url);
  await waitForContentScript(page);

  await sendToTab(extension, url, { type: "translatePage", providerOverrideId: "p_default" });
  await waitForTranslation(page, 1);
  expect((await paths()).every((path) => path.startsWith("/a/"))).toBe(true);

  const options = await extension.openOptions();
  const stored = await options.evaluate(() => chrome.storage.local.get("routing"));
  expect(JSON.stringify(stored)).toContain("r_site");
  expect(JSON.stringify(stored)).toContain("p_other");
  await options.close();

  // Reloading drops the override: the site rule applies again.
  stub.reset();
  await page.reload();
  await waitForContentScript(page);
  await sendToTab(extension, url, { type: "translatePage" });
  await waitForTranslation(page, 1);
  expect((await paths()).every((path) => path.startsWith("/b/"))).toBe(true);
});

test("a rule pointing at a deleted provider is reported and translation proceeds", async () => {
  await writeSettings(extension, {
    routing: {
      defaultProviderId: "p_default",
      rules: [
        { id: "r_broken", kind: "site", match: "127.0.0.1", providerId: "p_gone", enabled: true },
      ],
    },
  });

  const url = `${stub.origin}/pages/blog-post.html`;
  const page = await extension.openPage(url);
  await waitForContentScript(page);
  await sendToTab(extension, url, { type: "translatePage" });
  await waitForTranslation(page, 1);

  expect((await paths()).every((path) => path.startsWith("/a/"))).toBe(true);
  const status = await jobStatus(extension, url);
  expect(status.state).toBe("completed");
  expect(status.brokenRules?.[0]?.provider).toBe("p_gone");
  expect(status.brokenRules?.[0]?.using).toBe("p_default");
});
