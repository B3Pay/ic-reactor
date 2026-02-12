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
  /** Base output directory (default: ./src/canisters) */
  outDir?: string
  /**
   * Path to import ClientManager from (relative to generated file).
   * Default: "../../lib/client"
   */
  clientManagerPath?: string
  /**
   * Generate advanced per-method hooks with createQuery/createMutation
   * instead of generic actor hooks (default: false)
   */
  advanced?: boolean
}

// Re-export CanisterConfig for convenience
export type { CanisterConfig }

// ═══════════════════════════════════════════════════════════════════════════
// VITE PLUGIN
// ═══════════════════════════════════════════════════════════════════════════

export function icReactorPlugin(options: IcReactorPluginOptions): Plugin {
  const baseOutDir = options.outDir ?? "./src/canisters"

  return {
    name: "ic-reactor-plugin",

    async buildStart() {
      for (const canister of options.canisters) {
        const outDir = canister.outDir ?? path.join(baseOutDir, canister.name)

        console.log(
          `[ic-reactor] Generating hooks for ${canister.name} from ${canister.didFile}`
        )

        // Step 1: Generate declarations via @icp-sdk/bindgen
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

        console.log(
          `[ic-reactor] Declarations generated at ${result.declarationsDir}`
        )

        // Step 2: Read DID content for advanced mode
        let didContent: string | undefined
        if (options.advanced) {
          try {
            didContent = fs.readFileSync(canister.didFile, "utf-8")
          } catch (e) {
            console.warn(
              `[ic-reactor] Could not read DID file at ${canister.didFile}, skipping advanced hook generation.`
            )
            continue
          }
        }

        // Step 3: Generate the reactor file using shared codegen
        const reactorContent = generateReactorFile({
          canisterName: canister.name,
          canisterConfig: canister,
          globalClientManagerPath: options.clientManagerPath,
          hasDeclarations: true,
          advanced: options.advanced ?? false,
          didContent,
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
