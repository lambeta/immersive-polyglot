import { defineConfig, type UserConfig } from "vite";
import { fileURLToPath } from "node:url";

/**
 * Two builds of the DeepSeek Harness plugin, one config — mirroring vite.config.ts for the
 * extension. The Host half is an ES module for Node (DSH resolves the @deepseek-ai packages from
 * its own installation, so they stay external). The Client half is the CommonJS factory DSH's web
 * client loads, with React taken from the browser module table.
 */

const outDir = fileURLToPath(new URL("./plugin/lib", import.meta.url));
const CLIENT_ID = "immersive-polyglot-dsh";

/** The module-loader envelope every DSH client bundle is written in. */
const BANNER = `window.__ModuleLoader__.load({ id: "${CLIENT_ID}", factory: (require) => { var module = { exports: {} }; var exports = module.exports;`;
const FOOTER = "return module.exports; } });";

export default defineConfig(({ mode }): UserConfig => {
  if (mode === "client") {
    return {
      publicDir: false,
      // The browser module table supplies react/jsx-runtime; without this the lib build falls back
      // to the classic pragma and emits bare `React.createElement` with no React in scope.
      esbuild: { jsx: "automatic" },
      build: {
        outDir,
        emptyOutDir: false,
        target: "chrome120",
        minify: false,
        sourcemap: true,
        lib: {
          entry: fileURLToPath(new URL("./src/plugin/client/index.tsx", import.meta.url)),
          formats: ["cjs"],
          fileName: () => "client",
        },
        rollupOptions: {
          external: ["react", "react/jsx-runtime", "react-dom"],
          output: { entryFileNames: "client.js", banner: BANNER, footer: FOOTER },
        },
      },
    };
  }

  return {
    publicDir: false,
    build: {
      outDir,
      emptyOutDir: true,
      target: "node22",
      minify: false,
      sourcemap: true,
      lib: {
        entry: fileURLToPath(new URL("./src/plugin/host/index.ts", import.meta.url)),
        formats: ["es"],
        fileName: () => "index",
      },
      rollupOptions: {
        external: [/^node:/, /^@deepseek-ai\//],
        output: { entryFileNames: "index.js" },
      },
    },
  };
});
