import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // A browser page by default: `auth` sign-in, the `ic_env` cookie and
    // ReactorProvider exist only there. The agent still sends with Node's
    // fetch, which jsdom does not replace, so nothing is blocked by CORS.
    environment: "jsdom",
    // Asks `icp` for the replica and the deployed canister once, and fails the
    // run when there is none (start one with `bash test.sh`).
    globalSetup: ["./global-setup.ts"],
    setupFiles: ["./setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    // One file at a time: they share the canister's counter, and the
    // anonymous-write case reads it back to show that nothing was sent.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
    // No `passWithNoTests`: a run that finds no test file fails, so the E2E
    // job cannot go green with nothing in it again.
  },
})
