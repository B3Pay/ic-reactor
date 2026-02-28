/// <reference types="vitest" />
import { defineConfig } from "vitest/config"
import { config } from "dotenv"
import { readFileSync } from "fs"
import path from "path"

// Load .env file explicitly (relative to this package)
config({ path: path.resolve(__dirname, ".env") })

// if the variable still isn't defined, try to read from the dfx output JSON
function tryLoadFromDfx(): void {
  if (process.env.CANISTER_ID_HELLO_ACTOR) return
  try {
    const jsonPath = path.resolve(__dirname, ".dfx/local/canister_ids.json")
    const raw = readFileSync(jsonPath, "utf-8")
    const parsed = JSON.parse(raw)
    // dfx stores canister ids under network names; we only care about the local one
    if (parsed?.hello_actor) {
      // value may be an object keyed by network or an array
      const maybe =
        parsed.hello_actor.local ||
        parsed.hello_actor[Object.keys(parsed.hello_actor)[0]]
      if (typeof maybe === "string") {
        process.env.CANISTER_ID_HELLO_ACTOR = maybe
      } else if (Array.isArray(maybe) && maybe[0]) {
        process.env.CANISTER_ID_HELLO_ACTOR = maybe[0]
      }
    }
  } catch {
    /* ignore if file doesn't exist or parse fails */
  }
}

tryLoadFromDfx()

console.log(
  "VITEST CONFIG: CANISTER_ID_HELLO_ACTOR =",
  process.env.CANISTER_ID_HELLO_ACTOR
)

if (!process.env.CANISTER_ID_HELLO_ACTOR) {
  console.warn(
    "warning: CANISTER_ID_HELLO_ACTOR is not set; make sure you've run `pnpm --filter e2e run start` or deployed the canister with dfx before running vitest.`"
  )
  throw new Error(
    "CANISTER_ID_HELLO_ACTOR is missing in vitest config! Check .env file loading or deploy your canister."
  )
}

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./setup.ts"],
    include: ["src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
  },
  define: {
    // Explicitly replace process.env versions in the code
    "process.env.DFX_NETWORK": JSON.stringify(
      process.env.DFX_NETWORK || "local"
    ),
    "process.env.CANISTER_ID_HELLO_ACTOR": JSON.stringify(
      process.env.CANISTER_ID_HELLO_ACTOR
    ),
    "process.env.IC_HOST": JSON.stringify(
      process.env.IC_HOST || "http://127.0.0.1:4943"
    ),
  },
  resolve: {
    alias: {
      "@dfinity/agent": "@icp-sdk/core/agent",
      "@dfinity/candid": "@icp-sdk/core/candid",
      "@dfinity/principal": "@icp-sdk/core/principal",
      "@dfinity/identity": "@icp-sdk/core/identity",
    },
  },
})
