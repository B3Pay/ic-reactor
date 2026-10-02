import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test-setup.ts"],
    exclude: ["dist", "node_modules"],
    // The v4 hooks and their tests arrive with IR6 (#780). `vitest run` exits
    // 1 when it finds no test file, so the empty suite must be allowed to pass.
    passWithNoTests: true,
  },
})
