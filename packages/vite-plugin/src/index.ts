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

import type { Plugin } from "vite"
import fs from "fs"
import path from "path"
import { execSync } from "child_process"
import {
  generateDeclarations,
  generateReactorFile,
  type CanisterConfig,
} from "@ic-reactor/codegen"

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

function getIcEnvironmentInfo(canisterNames: string[]) {
  const environment = process.env.ICP_ENVIRONMENT || "local"

  try {
    const networkStatus = JSON.parse(
      execSync(`icp network status -e ${environment} --json`, {
        encoding: "utf-8",
      })
    )
    const rootKey = networkStatus.root_key
    // TODO: Use networkStatus.api_url when CLI supports it
    const proxyTarget = "http://127.0.0.1:4943"

    const canisterIds: Record<string, string> = {}
    for (const name of canisterNames) {
      try {
        const canisterId = execSync(
          `icp canister status ${name} -e ${environment} -i`,
          {
            encoding: "utf-8",
          }
        ).trim()
        canisterIds[name] = canisterId
      } catch {
        // Skip if canister not found
      }
    }

    return { environment, rootKey, proxyTarget, canisterIds }
  } catch {
    return null
  }
}

function buildIcEnvCookie(
  canisterIds: Record<string, string>,
  rootKey: string
): string {
  const envParts = [`ic_root_key=${rootKey}`]

  for (const [name, id] of Object.entries(canisterIds)) {
    envParts.push(`PUBLIC_CANISTER_ID:${name}=${id}`)
  }

  return encodeURIComponent(envParts.join("&"))
}

// ═══════════════════════════════════════════════════════════════════════════
// VITE PLUGIN
// ═══════════════════════════════════════════════════════════════════════════

export function icReactorPlugin(options: IcReactorPluginOptions): Plugin {
  const baseOutDir = options.outDir ?? "./src/canisters"

  return {
    name: "ic-reactor-plugin",

    config(_config, { command }) {
      if (command !== "serve" || !(options.autoInjectIcEnv ?? true)) {
        return {}
      }

      const canisterNames = options.canisters.map((c) => c.name)
      const icEnv = getIcEnvironmentInfo(canisterNames)

      if (!icEnv) {
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
      }

      const cookieValue = buildIcEnvCookie(icEnv.canisterIds, icEnv.rootKey)

      return {
        server: {
          headers: {
            "Set-Cookie": `ic_env=${cookieValue}; Path=/; SameSite=Lax;`,
          },
          proxy: {
            "/api": {
              target: icEnv.proxyTarget,
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
