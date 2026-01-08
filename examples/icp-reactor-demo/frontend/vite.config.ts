import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { icpBindgen } from "@icp-sdk/bindgen/plugins/vite"
import fs from "fs"
import path from "path"

// ═══════════════════════════════════════════════════════════════════════════
// icp-cli Environment Loader
// ═══════════════════════════════════════════════════════════════════════════
// Automatically reads canister IDs from icp-cli's cache directory.
// In production (deployed to asset canister), these come from the ic_env cookie.

/**
 * Loads canister IDs from icp-cli's local cache
 * Path: .icp/cache/mappings/local.ids.json
 */
function loadCanisterIds(): Record<string, string> {
  const idsPath = path.resolve(
    __dirname,
    "../.icp/cache/mappings/local.ids.json"
  )
  try {
    const content = fs.readFileSync(idsPath, "utf-8")
    return JSON.parse(content)
  } catch (error) {
    console.warn(`[icp-cli] Could not load canister IDs from ${idsPath}`)
    console.warn("[icp-cli] Make sure to run 'icp deploy' first")
    return {}
  }
}

// Load canister IDs from icp-cli cache
const canisterIds = loadCanisterIds()
const BACKEND_CANISTER_ID = canisterIds.backend || ""

// Local replica root key (used for development only)
const IC_ROOT_KEY_HEX =
  "308182301d060d2b0601040182dc7c0503010201060c2b0601040182dc7c050302010361008b52b4994f94c7ce4be1c1542d7c81dc79fea17d49efe8fa42e8566373581d4b969c4a59e96a0ef51b711fe5027ec01601182519d0a788f4bfe388e593b97cd1d7e44904de79422430bca686ac8c21305b3397b5ba4d7037d17877312fb7ee34"

// Build the ic_env cookie value with all PUBLIC_ canister IDs
function buildIcEnvCookie(): string {
  const envParts = [`ic_root_key=${IC_ROOT_KEY_HEX}`]

  // Add all canister IDs as PUBLIC_CANISTER_ID:<name>
  for (const [name, id] of Object.entries(canisterIds)) {
    envParts.push(`PUBLIC_CANISTER_ID:${name}=${id}`)
  }

  return envParts.join("&")
}

console.log("[icp-cli] Loaded canister IDs:", canisterIds)

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),

    // ═══════════════════════════════════════════════════════════════════════
    // @icp-sdk/bindgen Plugin
    // ═══════════════════════════════════════════════════════════════════════
    // Automatically generates TypeScript bindings from the Candid .did file.
    // Supports hot module replacement - edit .did and bindings update!
    icpBindgen({
      didFile: "../backend/backend.did",
      outDir: "./src/bindings/backend",
    }),
  ],

  server: {
    // ═══════════════════════════════════════════════════════════════════════
    // ic_env Cookie (Simulating Asset Canister Behavior)
    // ═══════════════════════════════════════════════════════════════════════
    // In production, the asset canister sets this cookie automatically.
    // For local dev, we simulate it here in the Vite dev server.
    headers: {
      "Set-Cookie": `ic_env=${encodeURIComponent(buildIcEnvCookie())}; SameSite=Lax;`,
    },

    // Proxy API calls to local replica
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4943",
        changeOrigin: true,
      },
    },
  },
})
