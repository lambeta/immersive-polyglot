#!/usr/bin/env node
/**
 * Generates the extension's action/app icons from one vector design, so the 16/32/48/128 assets
 * cannot drift from each other or from the product's bilingual-preview look.
 *
 * Design: a rounded blue-to-teal tile holding two text lines; the lower line sits on a yellow
 * marker band exactly like the product's "marker" display style. It reads as "original + translated"
 * at 16px, where glyph-based marks turn to mush.
 *
 * Requires a Playwright Chromium build (same one the e2e suite uses):
 *   PLAYWRIGHT_BROWSERS_PATH="$PWD/.playwright-browsers" npm run make:icons
 */
import { chromium } from "@playwright/test";
import { mkdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(new URL("../src/icons", import.meta.url));
const SIZES = [16, 32, 48, 128];

function iconSvg(size) {
  // The viewBox is fixed; only the raster size changes.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2b5bff"/>
      <stop offset="1" stop-color="#0f9d8f"/>
    </linearGradient>
    <clipPath id="tile">
      <rect x="4" y="4" width="120" height="120" rx="30"/>
    </clipPath>
  </defs>
  <rect x="4" y="4" width="120" height="120" rx="30" fill="url(#bg)"/>
  <g clip-path="url(#tile)">
    <rect x="24" y="38" width="80" height="14" rx="7" fill="#ffffff"/>
    <rect x="20" y="62" width="88" height="24" rx="5" fill="#ffd43b"/>
    <rect x="28" y="67" width="64" height="14" rx="7" fill="#16324f"/>
  </g>
</svg>`;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    for (const size of SIZES) {
      const page = await browser.newPage({
        viewport: { width: size, height: size },
        deviceScaleFactor: 1,
      });
      await page.setContent(
        "<style>html,body{margin:0;background:transparent}svg{display:block}</style>" + iconSvg(size),
      );
      const path = OUT + "/icon-" + size + ".png";
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
