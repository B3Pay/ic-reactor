import { defineConfig } from "vitest/config"

// The tests run over the committed generated modules (`pnpm gen:check` keeps
// them current), so they need neither the React plugin nor the generator, and
// never a replica: every canister is a mock on the in-memory replica of
// `createTestClient()`. jsdom gives them a page (http://localhost:3000), with
// the cookie jar `{ name }` canisters are resolved from and sessionStorage.
//
// package.json pins jsdom to 30.0.1: jsdom 30.1 subclasses the global
// `Iterator`, which StackBlitz's WebContainer does not define, so there every
// test file fails to start with "ReferenceError: Iterator is not defined".
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.ts"],
  },
})
