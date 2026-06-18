import { defineConfig } from "tsup"

/**
 * Build config for @ic-reactor/start.
 *
 * All runtime/peer dependencies are kept external so they aren't bundled into
 * dist (vite, @tanstack/router-plugin, and the workspace deps). The scaffold
 * and bin are Node-only and use only Node built-ins + the external deps.
 */
export default defineConfig({
  entry: {
    index: "src/index.ts",
    "plugin/vite": "src/plugin/vite.ts",
    "scaffold/index": "src/scaffold/index.ts",
    "bin/create-app": "src/bin/create-app.ts",
  },
  format: ["esm"],
  dts: true,
  splitting: false,
  clean: true,
  sourcemap: true,
  tsconfig: "tsconfig.json",
  external: [
    "vite",
    "@tanstack/router-plugin/vite",
    "@tanstack/router-plugin",
    "@ic-reactor/vite-plugin",
    "@ic-reactor/codegen",
    "node:path",
    "node:fs",
    "node:os",
    "path",
    "fs",
    "os",
  ],
})
