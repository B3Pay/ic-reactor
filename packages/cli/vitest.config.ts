/// <reference types="vitest" />
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    // The commands read `process.cwd()` — that is how a CLI decides which
    // project it is acting on — so each test runs in its own temp directory via
    // `process.chdir`, which needs a real process rather than a worker thread.
    pool: "forks",
    // Keep the commands' `console.log` output for the runs that fail, where it
    // is the diagnostic. (clack writes straight to stdout and is unaffected.)
    silent: "passed-only",
  },
})
