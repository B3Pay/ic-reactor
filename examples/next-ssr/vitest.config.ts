import { fileURLToPath } from "node:url"
import { configDefaults, defineConfig } from "vitest/config"

const SERVER_COMPONENT_TESTS = "src/**/*.rsc.test.{ts,tsx}"

// The tests run over the committed generated module (`pnpm gen:check` keeps
// it current) and never reach mainnet: every client in them is a
// `createTestClient()` over an in-memory replica. Server modules run in Node;
// a test that renders for the browser says `@vitest-environment jsdom`.
//
// package.json pins jsdom to 30.0.1: jsdom 30.1 subclasses the global
// `Iterator`, which StackBlitz's WebContainer does not define, so there a jsdom
// test fails to start with "ReferenceError: Iterator is not defined".
//
// A `*.rsc.test.tsx` file runs in the "react-server" project, as Next runs
// Server Components: with the `react-server` export condition, so `react` is
// React's server build, whose `cache()` memoizes for one request. Vitest
// resolves with `ssr.resolve.conditions`, and passes them to Node as
// `--conditions` for the packages Node loads itself (React's Flight server
// among them). The list is Vite's default for a server plus `react-server`.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    // Every read signs and verifies a reply on the in-memory replica; the
    // streaming test holds reads on purpose. 5 s, Vitest's default, is short
    // for a loaded CI runner.
    testTimeout: 20_000,
    projects: [
      {
        extends: true,
        test: {
          name: "app",
          environment: "node",
          include: ["src/**/*.test.{ts,tsx}"],
          setupFiles: ["src/testing/setup.ts"],
          exclude: [...configDefaults.exclude, SERVER_COMPONENT_TESTS],
        },
      },
      {
        extends: true,
        ssr: {
          resolve: {
            conditions: [
              "react-server",
              "module",
              "node",
              "development|production",
            ],
          },
        },
        test: {
          name: "react-server",
          environment: "node",
          include: [SERVER_COMPONENT_TESTS],
        },
      },
    ],
  },
})
