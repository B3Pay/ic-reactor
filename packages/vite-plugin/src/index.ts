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
import { execFileSync } from "child_process"
import {
  generateDeclarations,
  generateReactorFile,
  generateClientFile,
} from "@ic-reactor/codegen"

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════
export interface CanisterConfig {
  name: string
  outDir?: string
  didFile?: string
  clientManagerPath?: string
}

export interface IcReactorPluginOptions {
  /** List of canisters to generate hooks for */
  canisters: CanisterConfig[]
  /** Base output directory (default: ./src/lib/canisters) */
  outDir?: string
  /**
   * Path to import ClientManager from (relative to generated file).
   * Default: "../../clients"
   */
  clientManagerPath?: string
  /**
   * Automatically inject the IC environment (canister IDs and root key)
   * into the browser using an `ic_env` cookie. (default: true)
   *
   * This is useful for local development with `icp`.
   */
  injectEnvironment?: boolean
}

function getIcEnvironmentInfo(canisterNames: string[]) {
  const environment = process.env.ICP_ENVIRONMENT || "local"

  try {
    const networkStatus = JSON.parse(
      execFileSync("icp", ["network", "status", "-e", environment, "--json"], {
        encoding: "utf-8",
      })
    )
    const rootKey = networkStatus.root_key
    const proxyTarget = `http://127.0.0.1:${networkStatus.port}`

    const canisterIds: Record<string, string> = {}
    for (const name of canisterNames) {
      try {
        const canisterId = execFileSync(
          "icp",
          ["canister", "status", name, "-e", environment, "-i"],
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
  const baseOutDir = options.outDir ?? "./src/lib/canisters"

  return {
    name: "ic-reactor-plugin",

    config(_config, { command }) {
      if (command !== "serve" || !(options.injectEnvironment ?? true)) {
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
      // Step 0: Ensure central client manager exists (default: src/lib/clients.ts)
      const defaultClientPath = path.resolve(
        process.cwd(),
        "src/lib/clients.ts"
      )
      if (!fs.existsSync(defaultClientPath)) {
        console.log(
          `[ic-reactor] Default client manager not found. Creating at ${defaultClientPath}`
        )
        const clientContent = generateClientFile()
        fs.mkdirSync(path.dirname(defaultClientPath), { recursive: true })
        fs.writeFileSync(defaultClientPath, clientContent)
      }

      for (const canister of options.canisters) {
        let didFile = canister.didFile
        const outDir = canister.outDir ?? path.join(baseOutDir, canister.name)

        if (!didFile) {
          const environment = process.env.ICP_ENVIRONMENT || "local"

          console.log(
            `[ic-reactor] didFile not specified for "${canister.name}". Attempting to download from canister...`
          )
          try {
            const candidContent = execFileSync(
              "icp",
              [
                "canister",
                "metadata",
                canister.name,
                "candid:service",
                "-e",
                environment,
              ],
              { encoding: "utf-8" }
            ).trim()

            const declarationsDir = path.join(outDir, "declarations")
            if (!fs.existsSync(declarationsDir)) {
              fs.mkdirSync(declarationsDir, { recursive: true })
            }
            didFile = path.join(declarationsDir, `${canister.name}.did`)
            fs.writeFileSync(didFile, candidContent)
            console.log(
              `[ic-reactor] Candid downloaded and saved to ${didFile}`
            )
          } catch (error) {
            console.error(
              `[ic-reactor] Failed to download candid for ${canister.name}: ${error}`
            )
            continue
          }
        }

        console.log(
          `[ic-reactor] Generating hooks for ${canister.name} from ${didFile}`
        )

        // Step 1: Generate declarations via @ic-reactor/codegen
        const result = await generateDeclarations({
          didFile: didFile,
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
          didFile: didFile,
          clientManagerPath:
            canister.clientManagerPath ?? options.clientManagerPath,
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
        const canister = options.canisters.find((c) => {
          if (!c.didFile) return false
          return path.resolve(c.didFile) === file
        })
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
