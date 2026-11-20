/**
 * Guards the Client bundle against the classic-JSX trap: the lib build in `mode=client` must emit
 * `react/jsx-runtime` calls. If esbuild falls back to the classic pragma, the bundle writes bare
 * `React.createElement(...)` while nothing imports React, so every slot entry of this plugin crashes
 * on its first render and the shell abdicates it (the entry silently disappears from the slot).
 *
 * Run after `npm run build:plugin`; part of `npm run check:plugin`.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const bundle = fileURLToPath(new URL("../plugin/lib/client.js", import.meta.url));
const code = readFileSync(bundle, "utf8");

const fails = [];

if (!code.includes('"react/jsx-runtime"')) {
  fails.push("client bundle never requires react/jsx-runtime (classic JSX pragma in use)");
}

const classic = code.match(/\bReact\.createElement\(/g) ?? [];
if (classic.length > 0) {
  fails.push(`client bundle calls React.createElement ${classic.length} time(s) without importing React`);
}

if (fails.length > 0) {
  console.error("client JSX check failed:");
  for (const fail of fails) console.error(`  - ${fail}`);
  console.error("fix: keep `esbuild: { jsx: \"automatic\" }` on the client build in vite.plugin.config.ts");
  process.exit(1);
}

console.log("client JSX check: automatic runtime in use");
