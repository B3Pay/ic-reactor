/**
 * IC-Reactor Vite Plugin
 *
 * A Vite plugin that generates ic-reactor hooks from Candid .did files.
 *
 * ⚠️ IMPORTANT: This plugin ONLY generates the reactor and hooks.
 * The user is responsible for creating and configuring:
 * - ClientManager
 * - QueryClient
 *
 * The generated file will import the clientManager from a user-specified path.
 *
 * Usage:
 * ```ts
 * import { icReactorPlugin } from "./plugins/ic-reactor-plugin"
 *
 * export default defineConfig({
 *   plugins: [
 *     icReactorPlugin({
 *       canisters: [
 *         {
 *           name: "backend",
 *           didFile: "../backend/backend.did",
 *           clientManagerPath: "../lib/client" // User provides their own ClientManager
 *         }
 *       ]
 *     })
 *   ]
 * })
 * ```
 */

import type { Plugin } from "vite"
import { generate } from "@icp-sdk/bindgen/core"
import fs from "fs"
import path from "path"

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface CanisterConfig {
  /** Name of the canister (used for variable naming) */
  name: string
  /** Path to the .did file */
  didFile: string
  /** Output directory (default: ./src/canisters/<name>) */
  outDir?: string
  /** Use DisplayReactor for React-friendly types (default: true) */
  useDisplayReactor?: boolean
  /**
   * Path to import ClientManager from (relative to generated file).
   * The file at this path should export: { clientManager: ClientManager }
   * Default: "../../lib/client"
   */
  clientManagerPath?: string
}

export interface IcReactorPluginOptions {
  /** List of canisters to generate hooks for */
  canisters: CanisterConfig[]
  /** Base output directory (default: ./src/canisters) */
  outDir?: string
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

function toPascalCase(str: string): string {
  return str
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("")
}

function toCamelCase(str: string): string {
  const pascal = toPascalCase(str)
  return pascal.charAt(0).toLowerCase() + pascal.slice(1)
}

/**
 * Parse the idlFactory to determine query vs update methods
 */
function parseIdlFactory(
  jsContent: string
): Map<string, { isQuery: boolean; argTypes: string; returnType: string }> {
  const methodMap = new Map<
    string,
    { isQuery: boolean; argTypes: string; returnType: string }
  >()

  // Match: 'methodName' : IDL.Func([args], [return], ['query']?)
  const funcRegex =
    /['"]?(\w+)['"]?\s*:\s*IDL\.Func\(\[(.*?)\],\s*\[(.*?)\],\s*\[(.*?)\]\)/g
  let match

  while ((match = funcRegex.exec(jsContent)) !== null) {
    const [, methodName, argTypes, returnType, annotations] = match
    methodMap.set(methodName, {
      isQuery:
        annotations.includes("query") ||
        annotations.includes("composite_query"),
      argTypes: argTypes.trim(),
      returnType: returnType.trim(),
    })
  }

  return methodMap
}

// ═══════════════════════════════════════════════════════════════════════════
// GENERATOR
// ═══════════════════════════════════════════════════════════════════════════

function generateReactorFile(
  canisterName: string,
  methods: Map<
    string,
    { isQuery: boolean; argTypes: string; returnType: string }
  >,
  useDisplayReactor: boolean,
  clientManagerPath: string
): string {
  const pascalName = toPascalCase(canisterName)
  const camelName = toCamelCase(canisterName)
  const reactorType = useDisplayReactor ? "DisplayReactor" : "Reactor"

  // Separate queries and mutations
  const queries: string[] = []
  const mutations: string[] = []
  const queryKeys: string[] = []

  for (const [methodName, info] of methods) {
    const hookName = toCamelCase(methodName)
    const hasArgs = info.argTypes.length > 0

    if (info.isQuery) {
      queryKeys.push(methodName)

      if (hasArgs) {
        // Use createQueryFactory for queries with arguments
        queries.push(`
/**
 * Query: ${methodName}
 * Args: (${info.argTypes})
 * Returns: ${info.returnType || "void"}
 */
export const ${hookName}Query = createQueryFactory(${camelName}Reactor, {
  functionName: "${methodName}",
})
// Usage: ${hookName}Query([arg1, arg2]).useQuery() or use${toPascalCase(methodName)}({ args: [arg1] })
export const use${toPascalCase(methodName)} = (options: { args: Parameters<_SERVICE["${methodName}"]> } & Record<string, unknown> = { args: [] as any }) => 
  ${hookName}Query(options.args).useQuery(options)
`)
      } else {
        // Use createQuery for queries without arguments
        queries.push(`
/**
 * Query: ${methodName}
 * No arguments
 * Returns: ${info.returnType || "void"}
 */
export const ${hookName}Query = createQuery(${camelName}Reactor, {
  functionName: "${methodName}",
})
export const use${toPascalCase(methodName)} = ${hookName}Query.useQuery
export const use${toPascalCase(methodName)}Suspense = createSuspenseQuery(${camelName}Reactor, {
  functionName: "${methodName}",
}).useSuspenseQuery
`)
      }
    } else {
      // Find related queries to invalidate
      const relatedQueries = queryKeys
        .filter((q) =>
          q
            .toLowerCase()
            .includes(
              methodName
                .replace(/^(set_|update_|delete_|add_|create_|remove_)/, "")
                .toLowerCase()
            )
        )
        .map((q) => `${toCamelCase(q)}Query.getQueryKey()`)

      mutations.push(`
/**
 * Mutation: ${methodName}
 * ${info.argTypes ? `Args: (${info.argTypes})` : "No arguments"}
 * Returns: ${info.returnType || "void"}
 */
export const ${hookName}Mutation = createMutation(${camelName}Reactor, {
  functionName: "${methodName}",${
    relatedQueries.length > 0
      ? `
  invalidateQueries: [${relatedQueries.join(", ")}],`
      : ""
  }
})
export const use${toPascalCase(methodName)} = ${hookName}Mutation.useMutation
`)
    }
  }

  return `/* eslint-disable */
// @ts-nocheck

/**
 * AUTO-GENERATED BY @ic-reactor/vite-plugin
 * DO NOT EDIT MANUALLY
 *
 * Canister: ${canisterName}
 * Generated: ${new Date().toISOString()}
 *
 * This file provides type-safe React hooks for interacting with the
 * ${canisterName} canister using ic-reactor.
 */

import {
  ${reactorType},
  createQuery,
  createQueryFactory,
  createMutation,
  createSuspenseQuery,
} from "@ic-reactor/react"
import { safeGetCanisterEnv } from "@icp-sdk/core/agent/canister-env"

// ═══════════════════════════════════════════════════════════════════════════
// USER-PROVIDED CLIENT MANAGER
// ═══════════════════════════════════════════════════════════════════════════
// The clientManager is imported from the user's own configuration file.
// This allows full customization of agent options, network settings, etc.
import { clientManager } from "${clientManagerPath}"

// Import generated declarations from @icp-sdk/bindgen
import { idlFactory, type _SERVICE } from "./declarations/declarations/${canisterName}.did"

// ═══════════════════════════════════════════════════════════════════════════
// CANISTER ID RESOLUTION
// ═══════════════════════════════════════════════════════════════════════════

interface ${pascalName}CanisterEnv {
  readonly "PUBLIC_CANISTER_ID:${canisterName}": string
}

/**
 * Get canister ID from runtime environment (ic_env cookie)
 * Falls back to a placeholder in development
 */
function get${pascalName}CanisterId(): string {
  const env = safeGetCanisterEnv<${pascalName}CanisterEnv>()

  if (env?.["PUBLIC_CANISTER_ID:${canisterName}"]) {
    return env["PUBLIC_CANISTER_ID:${canisterName}"]
  }

  throw new Error("[ic-reactor] ${canisterName} canister ID not found in ic_env cookie")
}

// ═══════════════════════════════════════════════════════════════════════════
// REACTOR INSTANCE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ${pascalName} Reactor with ${useDisplayReactor ? "Display" : "Candid"} type transformations.
 * ${useDisplayReactor ? "Automatically converts bigint → string, Principal → string, etc." : "Uses raw Candid types."}
 */
export const ${camelName}Reactor = new ${reactorType}<_SERVICE>({
  clientManager,
  canisterId: get${pascalName}CanisterId(),
  idlFactory,
  name: "${canisterName}",
})

// ═══════════════════════════════════════════════════════════════════════════
// QUERY HOOKS
// ═══════════════════════════════════════════════════════════════════════════
${queries.join("\n")}

// ═══════════════════════════════════════════════════════════════════════════
// MUTATION HOOKS
// ═══════════════════════════════════════════════════════════════════════════
${mutations.join("\n")}

// ═══════════════════════════════════════════════════════════════════════════
// RE-EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export { idlFactory }
export type { _SERVICE as ${pascalName}Service }
export { ${camelName}Reactor as reactor }
`
}

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
        const declarationsDir = path.join(outDir, "declarations")

        console.log(
          `[ic-reactor] Generating hooks for ${canister.name} from ${canister.didFile}`
        )

        // Clean existing declarations before regenerating
        if (fs.existsSync(declarationsDir)) {
          fs.rmSync(declarationsDir, { recursive: true, force: true })
        }
        fs.mkdirSync(declarationsDir, { recursive: true })

        // Step 1: Use @icp-sdk/bindgen to generate declarations
        try {
          await generate({
            didFile: canister.didFile,
            outDir: declarationsDir,
            output: {
              actor: {
                disabled: true,
              },
            },
          })

          // Remove the actor file that bindgen generates - we don't need it
          // ic-reactor provides its own reactor pattern instead
          const actorFilePath = path.join(
            declarationsDir,
            `${canister.name}.ts`
          )
          if (fs.existsSync(actorFilePath)) {
            fs.unlinkSync(actorFilePath)
          }

          console.log(
            `[ic-reactor] Declarations generated at ${declarationsDir}`
          )
        } catch (error) {
          console.error(`[ic-reactor] Failed to generate declarations:`, error)
          continue
        }

        // Step 2: Parse the generated files
        const actualDeclarationsDir = path.join(declarationsDir, "declarations")
        let jsPath = path.join(actualDeclarationsDir, `${canister.name}.did.js`)

        if (!fs.existsSync(jsPath)) {
          const fallbackPath = path.join(
            declarationsDir,
            `${canister.name}.did.js`
          )
          if (fs.existsSync(fallbackPath)) {
            jsPath = fallbackPath
          } else {
            console.error(`[ic-reactor] Generated file not found: ${jsPath}`)
            console.error(`[ic-reactor] Also tried: ${fallbackPath}`)
            continue
          }
        }

        const jsContent = fs.readFileSync(jsPath, "utf-8")
        const methodMap = parseIdlFactory(jsContent)

        console.log(
          `[ic-reactor] Found ${methodMap.size} methods: ${[...methodMap.keys()].join(", ")}`
        )

        // Step 3: Generate the reactor file
        const clientManagerPath =
          canister.clientManagerPath ?? "../../lib/client"
        const reactorContent = generateReactorFile(
          canister.name,
          methodMap,
          canister.useDisplayReactor ?? true,
          clientManagerPath
        )

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
