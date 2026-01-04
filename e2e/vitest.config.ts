/// <reference types="vitest" />
import { defineConfig } from "vitest/config"
import { config } from "dotenv"

// Load .env file explicitly
config({ path: ".env" })

console.log(
  "VITEST CONFIG: CANISTER_ID_HELLO_ACTOR =",
  process.env.CANISTER_ID_HELLO_ACTOR
)

if (!process.env.CANISTER_ID_HELLO_ACTOR) {
  throw new Error(
    "CANISTER_ID_HELLO_ACTOR is missing in vitest config! Check .env file loading."
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
      "@icp-sdk/core/agent": "@icp-sdk/core/agent",
      "@icp-sdk/core/candid": "@icp-sdk/core/candid",
      "@icp-sdk/core/principal": "@icp-sdk/core/principal",
      "@icp-sdk/core/identity": "@icp-sdk/core/identity",
    },
  },
})
