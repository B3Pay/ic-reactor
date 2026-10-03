import { defineConfig } from "vitest/config"

// The tests run the CLI's `run()` in Node over createTestClient()'s in-memory
// replica (src/test-kit.ts), and src/cli.test.ts runs src/cli.ts itself with
// Node's type stripping. None of them reaches a network.
export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts"] },
})
