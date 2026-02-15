/**
 * IC-Reactor Vite Plugin
 *
 * A Vite plugin that generates ic-reactor hooks from Candid .did files.
 * Uses @ic-reactor/codegen for all code generation logic.
 *
 * Usage:
 * ```ts
 * import { icReactorPlugin } from "@ic-reactor/vite-plugin"
 *
 * export default defineConfig({
 *   plugins: [
 *     icReactorPlugin({
 *       canisters: [
 *         {
 *           name: "backend",
 *           didFile: "../backend/backend.did",
 *           clientManagerPath: "../lib/client"
 *         }
 *       ]
 *     })
 *   ]
 * })
 * ```
 */

import type { Plugin, ViteDevServer } from "vite"
import fs from "fs"
import path from "path"
import {
  generateDeclarations,
  generateReactorFile,
  type CanisterConfig,
} from "@ic-reactor/codegen"

const ICP_LOCAL_IDS_PATH = ".icp/cache/mappings/local.ids.json"
const IC_ROOT_KEY_HEX =
  "308182301d060d2b0601040182dc7c0503010201060c2b0601040182dc7c050302010361008b52b4994f94c7ce4be1c1542d7c81dc79fea17d49efe8fa42e8566373581d4b969c4a59e96a0ef51b711fe5027ec01601182519d0a788f4bfe388e593b97cd1d7e44904de79422430bca686ac8c21305b3397b5ba4d7037d17877312fb7ee34"

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface IcReactorPluginOptions {
  /** List of canisters to generate hooks for */
  canisters: (CanisterConfig & { name: string })[]
  /** Base output directory (default: ./lib/canisters) */
  outDir?: string
  /**
   * Path to import ClientManager from (relative to generated file).
   * Default: "../../client"
   */
  clientManagerPath?: string
  /**
   * Automatically set the `ic_env` cookie in Vite dev server from
   * `.icp/cache/mappings/local.ids.json` (default: true).
   */
  autoInjectIcEnv?: boolean
}

// Re-export CanisterConfig for convenience
export type { CanisterConfig }

function loadLocalCanisterIds(rootDir: string): Record<string, string> | null {
  const idsPath = path.resolve(rootDir, ICP_LOCAL_IDS_PATH)

  try {
    return JSON.parse(fs.readFileSync(idsPath, "utf-8"))
  } catch {
    return null
  }
}

function buildIcEnvCookie(canisterIds: Record<string, string>): string {
  const envParts = [`ic_root_key=${IC_ROOT_KEY_HEX}`]

  for (const [name, id] of Object.entries(canisterIds)) {
    envParts.push(`PUBLIC_CANISTER_ID:${name}=${id}`)
  }

  return encodeURIComponent(envParts.join("&"))
}

function addOrReplaceSetCookie(
  existing: string | string[] | number | undefined,
  cookie: string
): string[] {
  const cookieEntries =
    typeof existing === "string"
      ? [existing]
      : Array.isArray(existing)
        ? existing.filter((value): value is string => typeof value === "string")
        : []

  const nonIcEnvCookies = cookieEntries.filter(
    (entry) => !entry.trim().startsWith("ic_env=")
  )

  return [...nonIcEnvCookies, cookie]
}

function setupIcEnvMiddleware(server: ViteDevServer): void {
  const rootDir = server.config.root || process.cwd()
  const idsPath = path.resolve(rootDir, ICP_LOCAL_IDS_PATH)
  let hasLoggedHint = false

  server.middlewares.use((req, res, next) => {
    const canisterIds = loadLocalCanisterIds(rootDir)

    if (!canisterIds) {
      if (!hasLoggedHint) {
        server.config.logger.info(
          `[ic-reactor] icp-cli local IDs not found at ${idsPath}. Run \`icp deploy\` to enable automatic ic_env cookie injection.`
        )
        hasLoggedHint = true
      }

      return next()
    }

    const cookie = `ic_env=${buildIcEnvCookie(canisterIds)}; Path=/; SameSite=Lax;`
    const current = res.getHeader("Set-Cookie")
    res.setHeader("Set-Cookie", addOrReplaceSetCookie(current, cookie))

    next()
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// VITE PLUGIN
// ═══════════════════════════════════════════════════════════════════════════

export function icReactorPlugin(options: IcReactorPluginOptions): Plugin {
  const baseOutDir = options.outDir ?? "./src/canisters"

  return {
    name: "ic-reactor-plugin",

    configureServer(server) {
      if (options.autoInjectIcEnv ?? true) {
        setupIcEnvMiddleware(server)
      }
    },

    config(config) {
      return {
        server: {
          proxy: {
            "/api": {
              target: "http://127.0.0.1:4943",
              changeOrigin: true,
            },
          },
        },
      }
    },

    async buildStart() {
      for (const canister of options.canisters) {
        const outDir = canister.outDir ?? path.join(baseOutDir, canister.name)

        console.log(
          `[ic-reactor] Generating hooks for ${canister.name} from ${canister.didFile}`
        )

        // Step 1: Generate declarations via @ic-reactor/codegen
        const result = await generateDeclarations({
          didFile: canister.didFile,
          outDir,
          canisterName: canister.name,
        })

        if (!result.success) {
          console.error(
            `[ic-reactor] Failed to generate declarations: ${result.error}`
          )
          continue
        }

        // Step 2: Generate the reactor file using shared codegen
        const reactorContent = generateReactorFile({
          canisterName: canister.name,
          canisterConfig: canister,
          globalClientManagerPath: options.clientManagerPath,
        })

        const reactorPath = path.join(outDir, "index.ts")
        fs.mkdirSync(outDir, { recursive: true })
        fs.writeFileSync(reactorPath, reactorContent)

        console.log(`[ic-reactor] Reactor hooks generated at ${reactorPath}`)
      }
    },

    handleHotUpdate({ file, server }) {
      // Watch for .did file changes and regenerate
      if (file.endsWith(".did")) {
        const canister = options.canisters.find(
          (c) => path.resolve(c.didFile) === file
        )
        if (canister) {
          console.log(
            `[ic-reactor] Detected change in ${file}, regenerating...`
          )
          server.restart()
        }
      }
    },
  }
}

export default icReactorPlugin
