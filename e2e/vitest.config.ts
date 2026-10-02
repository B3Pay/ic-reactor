/// <reference types="vitest" />
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./setup.ts"],
    include: ["src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    // The 3.x cases are gone and the v4 ones arrive with IR9b (#787). `vitest
    // run` exits 1 when it finds no test file, so the empty suite must be
    // allowed to pass.
    passWithNoTests: true,
  },
})
