import { defineConfig } from "vitest/config"

// The tests run over the committed generated module (`pnpm gen:check` keeps it
// current), so they need neither the React plugin nor the generator. The
// sandbox's own tests run in Node; a `.test.tsx` renders the page in jsdom.
//
// package.json pins jsdom to 30.0.1: jsdom 30.1 subclasses the global
// `Iterator`, which StackBlitz's WebContainer does not define, so there a jsdom
// test fails to start with "ReferenceError: Iterator is not defined".
export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.{ts,tsx}"] },
})
