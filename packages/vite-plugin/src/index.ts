/**
 * @ic-reactor/vite-plugin
 *
 * Vite plugin that:
 * 1. Generates hooks at build time (using @ic-reactor/codegen pipeline)
 * 2. Injects `ic_env` cookie for local development (via proxy)
 * 3. Hot-reloads when .did files change
 */

import type { Plugin } from "vite"
import path from "node:path"
import {
  runCanisterPipeline,
  type CanisterConfig,
  type CodegenConfig,
} from "@ic-reactor/codegen"
import { getIcEnvironmentInfo, buildIcEnvCookie } from "./env.js"

export interface IcReactorPluginOptions {
  /**
   * Canister configurations.
   * `name` is required for each canister.
   */
  canisters: CanisterConfig[]
  /**
   * Default output directory (relative to project root).
   * Default: "src/declarations"
   */
  outDir?: string
  /**
   * Default client manager import path.
   * Default: "../../clients"
   */
  clientManagerPath?: string
  /**
   * Automatically inject `ic_env` cookie for local development?
   * Default: true
   */
  injectEnvironment?: boolean
}

export function icReactor(options: IcReactorPluginOptions): any {
  const {
    canisters,
    outDir = "src/declarations",
    clientManagerPath = "../../clients",
    injectEnvironment = true,
  } = options

  // Construct a partial CodegenConfig to pass to the pipeline
  const globalConfig: Pick<CodegenConfig, "outDir" | "clientManagerPath"> = {
    outDir,
    clientManagerPath,
  }
  const projectRoot = process.cwd()
  const resolveDidPath = (didFile: string) =>
    path.normalize(
      path.isAbsolute(didFile) ? didFile : path.resolve(projectRoot, didFile)
    )

  const plugin: Plugin = {
    name: "ic-reactor-plugin",
    enforce: "pre", // Run before other plugins

    config(config, { command }) {
      if (command !== "serve" || !injectEnvironment) {
        return {}
      }

      // ── Local Development Proxy & Cookies ────────────────────────────────

      // Always include internet_identity if not present (common need)
      const canisterNames = canisters
        .map((c) => c.name)
        .filter((n): n is string => !!n)
      if (!canisterNames.includes("internet_identity")) {
        canisterNames.push("internet_identity")
      }

      const icEnv = getIcEnvironmentInfo(canisterNames)

      if (!icEnv) {
        // Fallback: just proxy /api to default local replica
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

    configureServer(server) {
      // Explicitly watch configured DID files so HMR works even when they are not in the module graph.
      const didFiles = canisters.map((c) => resolveDidPath(c.didFile))
      server.watcher.add(didFiles)
    },

    async buildStart() {
      // ── Code Generation ──────────────────────────────────────────────────

      console.log(
        `[ic-reactor] Generating hooks for ${canisters.length} canisters...`
      )

      for (const canisterConfig of canisters) {
        try {
          // If .did file is missing, we might want to attempt pulling it?
          // For now, pipeline fails if missing. The old plugin logic to "download"
          // is omitted for simplicity unless requested, to keep "codegen" pure.

          const result = await runCanisterPipeline({
            canisterConfig,
            projectRoot,
            globalConfig,
          })

          if (!result.success) {
            console.error(
              `[ic-reactor] Failed to generate ${canisterConfig.name}: ${result.error}`
            )
          } else {
            // Optional: log success
            // console.log(`[ic-reactor] Generated ${canisterConfig.name} hooks`)
          }
        } catch (err) {
          console.error(
            `[ic-reactor] Error generating ${canisterConfig.name}:`,
            err
          )
        }
      }
    },

    handleHotUpdate({ file, server }) {
      // ── Hot Reload on .did changes ───────────────────────────────────────
      if (file.endsWith(".did")) {
        const affectedCanister = canisters.find((c) => {
          // Check if changed file matches configured didFile
          // Cast is safe because didFile is required in CanisterConfig
          const configPath = resolveDidPath(c.didFile)
          return configPath === path.normalize(file)
        })

        if (affectedCanister) {
          console.log(
            `[ic-reactor] .did file changed: ${affectedCanister.name}. Regenerating...`
          )

          // Re-run pipeline for this canister
          runCanisterPipeline({
            canisterConfig: affectedCanister,
            projectRoot,
            globalConfig,
          }).then((result: import("@ic-reactor/codegen").PipelineResult) => {
            if (result.success) {
              // Reload page to reflect new types/hooks
              server.ws.send({ type: "full-reload" })
            } else {
              console.error(`[ic-reactor] Regeneration failed: ${result.error}`)
            }
          })
        }
      }
    },
  }

  return plugin
}
