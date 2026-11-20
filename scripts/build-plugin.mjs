#!/usr/bin/env node
/**
 * Build the DeepSeek Harness plugin into plugin/lib, from the same checkout that builds the
 * extension. One command, two halves, no runtime dependency.
 *
 *   npm run build:plugin
 */
import { build } from "vite";
import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const configFile = join(root, "vite.plugin.config.ts");

const fail = (message) => {
  console.error("build:plugin failed — " + message);
  process.exit(1);
};

await build({ root, configFile, mode: "host", logLevel: "warn" });
await build({ root, configFile, mode: "client", logLevel: "warn" });

for (const name of ["index.js", "client.js"]) {
  const path = join(root, "plugin", "lib", name);
  if (!existsSync(path) || statSync(path).size < 200) fail(`plugin/lib/${name} is missing or empty`);
}

console.log("plugin built → plugin/lib/index.js, plugin/lib/client.js");
console.log("install it with DSH → Plugins → Add plugin, choosing the plugin/ directory");
