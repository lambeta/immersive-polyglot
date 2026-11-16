#!/usr/bin/env node
/**
 * Renders the extension's action/app icons from the single vector masters:
 *   design.svg         -> icon-16.png, icon-32.png, icon-48.png, icon-128.png
 *   design-checked.svg -> icon-16-check.png, …, icon-128-check.png
 *
 * Feature 009: the checked variant is the same mark with the translation-on badge already drawn,
 * so the product owns the badge's size and position instead of accepting the browser's badge
 * geometry. One source, four sizes, both states, so neither state can drift from the other.
 *
 * Requires a Playwright Chromium build (the same one the e2e suite uses):
 *   PLAYWRIGHT_BROWSERS_PATH="$PWD/.playwright-browsers" npm run make:icons
 */
import { chromium } from "@playwright/test";
import { mkdir, readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const ICONS = fileURLToPath(new URL("../src/icons", import.meta.url));
const MASTERS = [
  { file: "design.svg", suffix: "" },
  { file: "design-checked.svg", suffix: "-check" },
];
const SIZES = [16, 32, 48, 128];

async function main() {
  await mkdir(ICONS, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    for (const master of MASTERS) {
      const svg = await readFile(ICONS + "/" + master.file, "utf8");
      for (const size of SIZES) {
        const page = await browser.newPage({
          viewport: { width: size, height: size },
          deviceScaleFactor: 1,
        });
        await page.setContent(
          "<style>html,body{margin:0;background:transparent}svg{display:block;width:100%;height:100%}</style>" +
            svg,
        );
        const path = ICONS + "/icon-" + size + master.suffix + ".png";
        await page.screenshot({ path, omitBackground: true });
        await page.close();
        const info = await stat(path);
        console.log("wrote " + path + " (" + info.size + " bytes)");
      }
    }
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
