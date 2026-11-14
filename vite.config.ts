import { defineConfig, type UserConfig } from "vite";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("./src", import.meta.url));

/**
 * Two builds, one config.
 *
 * The extension has four entry points (service worker, content script, popup, options).
 * Chrome loads content scripts as classic scripts — they cannot be ES modules — while the
 * service worker and extension pages may be module code. A single Rollup build cannot emit an
 * IIFE bundle for one entry and ES chunks for the others, so the mode selects the target:
 *
 *   mode === "content" -> single IIFE bundle for the content script
 *   anything else      -> ES module entries for the worker and the HTML pages
 *
 * scripts/build.mjs runs both in order. The manifest, _locales and the measured CSS are copied
 * unchanged, because each of them must appear in dist/ exactly as manifest.json declares it.
 */
export default defineConfig(({ mode }): UserConfig => {
  const isContent = mode === "content";

  return {
    root,
    publicDir: false,
    build: {
      outDir: fileURLToPath(new URL("./dist", import.meta.url)),
      emptyOutDir: false,
      target: "chrome120",
      minify: false,
      sourcemap: true,
      rollupOptions: {
        // The two modes deliberately have different entry sets; the cast keeps one config file
        // honest instead of splitting it in two.
        input: (isContent
          ? { "content/index": fileURLToPath(new URL("./src/content/index.ts", import.meta.url)) }
          : {
              "background/service-worker": fileURLToPath(
                new URL("./src/background/service-worker.ts", import.meta.url),
              ),
              "ui/popup/popup": fileURLToPath(new URL("./src/ui/popup/popup.html", import.meta.url)),
              "ui/options/options": fileURLToPath(
                new URL("./src/ui/options/options.html", import.meta.url),
              ),
            }) as Record<string, string>,
        output: (isContent
          ? {
              format: "iife",
              inlineDynamicImports: true,
              entryFileNames: "content/index.js",
              assetFileNames: "assets/[name][extname]",
            }
          : {
              format: "es",
              entryFileNames: "[name].js",
              chunkFileNames: "assets/[name]-[hash].js",
              assetFileNames: "assets/[name][extname]",
            }) as import("rollup").OutputOptions,
      },
    },
  };
});
