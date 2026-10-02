/// <reference types="vitest" />
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    // The v4 tests arrive with the slices that add the code they cover
    // (milestone 1, #790). `vitest run` exits 1 when it finds no test file, so
    // an emptied suite would fail CI until the first one lands.
    passWithNoTests: true,
  },
})
