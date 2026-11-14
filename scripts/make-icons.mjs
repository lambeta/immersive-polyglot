#!/usr/bin/env node
/**
 * Renders the extension's action/app icons from `src/icons/design.svg`, the single vector master.
 * One source, four sizes, so the toolbar, the extensions page and the store listing cannot drift.
 *
 * The master is the dual-page mark designed for this product: a gold translation page peeking from
 * behind an off-white reading page, with a dark source line and a gold marker line on the front.
 *
 * Requires a Playwright Chromium build (the same one the e2e suite uses):
 *   PLAYWRIGHT_BROWSERS_PATH="$PWD/.playwright-browsers" npm run make:icons
 */
import { chromium } from "@playwright/test";
import { mkdir, readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const ICONS = fileURLToPath(new URL("../src/icons", import.meta.url));
const DESIGN = ICONS + "/design.svg";
const SIZES = [16, 32, 48, 128];

async function main() {
  const svg = await readFile(DESIGN, "utf8");
  await mkdir(ICONS, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    for (const size of SIZES) {
      const page = await browser.newPage({
        viewport: { width: size, height: size },
        deviceScaleFactor: 1,
      });
      await page.setContent(
        "<style>html,body{margin:0;background:transparent}svg{display:block;width:100%;height:100%}</style>" +
          svg,
      );
      const path = ICONS + "/icon-" + size + ".png";
      await page.screenshot({ path, omitBackground: true });
      await page.close();
      const info = await stat(path);
      console.log("wrote " + path + " (" + info.size + " bytes)");
    }
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
