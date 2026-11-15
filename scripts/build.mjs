#!/usr/bin/env node
// Builds a chrome://extensions-loadable dist/ from the single source tree.
// Two Vite passes (see vite.config.ts for why) plus verbatim copies of the files the
// manifest references directly.
import { rmSync, mkdirSync, cpSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const dist = fileURLToPath(new URL("../dist", import.meta.url));
const src = fileURLToPath(new URL("../src", import.meta.url));

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

await build({ mode: "content" });
await build({ mode: "extension" });

// Files the manifest names directly must land at exactly those paths.
cpSync(`${src}/manifest.json`, `${dist}/manifest.json`);
cpSync(`${src}/_locales`, `${dist}/_locales`, { recursive: true });
cpSync(`${src}/icons`, `${dist}/icons`, { recursive: true });
mkdirSync(`${dist}/styles`, { recursive: true });
cpSync(`${src}/styles/content.css`, `${dist}/styles/content.css`);
cpSync(`${src}/styles/display-styles.css`, `${dist}/styles/display-styles.css`);

// The bundled faces travel with their licences: OFL 1.1 asks that the licence text be
// redistributed alongside the font software, and the .woff2 files are emitted by Vite.
mkdirSync(`${dist}/fonts`, { recursive: true });
for (const file of readdirSync(`${src}/ui/shared/fonts`)) {
  if (file.endsWith(".txt")) cpSync(`${src}/ui/shared/fonts/${file}`, `${dist}/fonts/${file}`);
}

console.log("built dist/");
