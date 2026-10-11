import { defineConfig } from "vitest/config"

// The tests run over the committed generated modules (`pnpm gen:check` keeps
// them current), so they need neither the Start and React plugins nor the
// generator, and never mainnet: every client in them is a `createTestClient()`
// over an in-memory replica, and the live interface loader takes an injected
// fetcher.
//
// package.json pins jsdom to 30.0.1: jsdom 30.1 subclasses the global
// `Iterator`, which StackBlitz's WebContainer does not define, so there a jsdom
// test fails to start with "ReferenceError: Iterator is not defined".
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    // Every read signs and verifies a reply on the in-memory replica; 5 s,
    // Vitest's default, is short for a loaded CI runner.
    testTimeout: 20_000,
  },
})
