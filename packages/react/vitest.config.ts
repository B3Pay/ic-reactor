import { defineConfig } from "vitest/config"

/**
 * Two projects, because the claims differ by where the code runs. A server
 * render has to work where there is no `window` and no `localStorage`, which
 * only a Node environment proves; everything else needs a DOM to hydrate and
 * mount into. A test file ending `.server.test.tsx` runs in Node, every other
 * test in jsdom.
 */
export default defineConfig({
  test: {
    globals: true,
    exclude: ["dist", "node_modules"],
    projects: [
      {
        extends: true,
        test: {
          name: "browser",
          environment: "jsdom",
          // Exposes `gc()`, so that the one test that needs a real garbage
          // collection (a thrown-away render's client is disposed once its
          // state is collected) runs here instead of being skipped.
          execArgv: ["--expose-gc"],
          include: ["tests/**/*.test.{ts,tsx}"],
          exclude: ["tests/**/*.server.test.{ts,tsx}", "dist", "node_modules"],
        },
      },
      {
        extends: true,
        test: {
          name: "server",
          environment: "node",
          include: ["tests/**/*.server.test.{ts,tsx}"],
        },
      },
    ],
  },
})
