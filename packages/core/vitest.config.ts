/// <reference types="vitest" />
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    // Exposes `gc()`, so that the test that runs a real garbage collection
    // (the client keeps no mutation observer alive, in
    // client-account-change) runs it instead of skipping it.
    execArgv: ["--expose-gc"],
    // The v4 tests arrive with the slices that add the code they cover
    // (milestone 1, #790). `vitest run` exits 1 when it finds no test file, so
    // an emptied suite would fail CI until the first one lands.
    passWithNoTests: true,
  },
})
