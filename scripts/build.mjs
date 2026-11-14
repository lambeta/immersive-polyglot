#!/usr/bin/env node
// Builds a chrome://extensions-loadable dist/ from the single source tree.
// Two Vite passes (see vite.config.ts for why) plus verbatim copies of the files the
// manifest references directly.
import { rmSync, mkdirSync, cpSync } from "node:fs";
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
mkdirSync(`${dist}/styles`, { recursive: true });
cpSync(`${src}/styles/content.css`, `${dist}/styles/content.css`);
cpSync(`${src}/styles/display-styles.css`, `${dist}/styles/display-styles.css`);

console.log("built dist/");
