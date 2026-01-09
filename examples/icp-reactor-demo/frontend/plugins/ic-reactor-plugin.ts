/**
 * IC-Reactor Vite Plugin
 *
 * A Vite plugin that generates ic-reactor hooks from Candid .did files.
 * Wraps @icp-sdk/bindgen for declarations, then generates React hooks.
 *
 * Usage:
 * ```ts
 * import { icReactorPlugin } from "./plugins/ic-reactor-plugin"
 *
 * export default defineConfig({
 *   plugins: [
 *     icReactorPlugin({
 *       canisters: [
 *         { name: "backend", didFile: "../backend/backend.did" }
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
 * Parse the generated .did.d.ts file to extract method info
 */
function parseServiceMethods(
  dtsContent: string
): Array<{ name: string; isQuery: boolean; hasArgs: boolean }> {
  const methods: Array<{ name: string; isQuery: boolean; hasArgs: boolean }> =
    []

  // Match ActorMethod<[args], return> patterns
  const methodRegex = /(\w+):\s*ActorMethod<\[(.*?)\],\s*(.*?)>/g
  let match

  while ((match = methodRegex.exec(dtsContent)) !== null) {
    const [, methodName, args] = match
    methods.push({
      name: methodName,
      hasArgs: args.trim().length > 0,
      isQuery: false, // Will be determined from .did.js
    })
  }

  return methods
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
  // or: methodName: IDL.Func([args], [return], ["query"]?)
  // The bindgen uses single quotes: 'get_counter' : IDL.Func([], [IDL.Nat], ['query'])
  const funcRegex =
    /['"]?(\w+)['"]?\s*:\s*IDL\.Func\(\[(.*?)\],\s*\[(.*?)\],\s*\[(.*?)\]\)/g
  let match

  while ((match = funcRegex.exec(jsContent)) !== null) {
    const [, methodName, argTypes, returnType, annotations] = match
    methodMap.set(methodName, {
      isQuery: annotations.includes("query"),
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
  useDisplayReactor: boolean
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

import { QueryClient } from "@tanstack/react-query"
import {
  ClientManager,
  ${reactorType},
  createQuery,
  createQueryFactory,
  createMutation,
  createSuspenseQuery,
  createAuthHooks,
} from "@ic-reactor/react"
import { safeGetCanisterEnv } from "@icp-sdk/core/agent/canister-env"
import { idlFactory, type _SERVICE } from "./declarations/declarations/${canisterName}.did"

// ═══════════════════════════════════════════════════════════════════════════
// CANISTER ENVIRONMENT
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

  console.warn("[ic-reactor] ${canisterName} canister ID not found in ic_env cookie")
  return "aaaaa-aa" // Fallback
}

// ═══════════════════════════════════════════════════════════════════════════
// GLOBAL CLIENT MANAGER (Singleton)
// ═══════════════════════════════════════════════════════════════════════════

let _queryClient: QueryClient | null = null
let _clientManager: ClientManager | null = null

function getQueryClient(): QueryClient {
  if (!_queryClient) {
    _queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 1000 * 60,
          gcTime: 1000 * 60 * 5,
          retry: 1,
          refetchOnWindowFocus: false,
        },
      },
    })
  }
  return _queryClient
}

function getClientManager(): ClientManager {
  if (!_clientManager) {
    const env = safeGetCanisterEnv()
    _clientManager = new ClientManager({
      queryClient: getQueryClient(),
      agentOptions: {
        host: typeof window !== "undefined" ? window.location.origin : undefined,
        rootKey: env?.IC_ROOT_KEY,
        verifyQuerySignatures: false,
      },
    })
    _clientManager.initialize().catch(console.error)
  }
  return _clientManager
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS: Query Client & Client Manager
// ═══════════════════════════════════════════════════════════════════════════

export const queryClient = getQueryClient()
export const clientManager = getClientManager()

// ═══════════════════════════════════════════════════════════════════════════
// AUTH HOOKS
// ═══════════════════════════════════════════════════════════════════════════

export const { useAuth, useAgentState, useUserPrincipal } = createAuthHooks(clientManager)

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
          })
          console.log(
            `[ic-reactor] Declarations generated at ${declarationsDir}`
          )
        } catch (error) {
          console.error(`[ic-reactor] Failed to generate declarations:`, error)
          continue
        }

        // Step 2: Parse the generated files
        // Note: bindgen creates files at outDir/declarations/<name>.did.js
        const actualDeclarationsDir = path.join(declarationsDir, "declarations")
        let jsPath = path.join(actualDeclarationsDir, `${canister.name}.did.js`)

        if (!fs.existsSync(jsPath)) {
          // Try the directly specified path as fallback
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
        const reactorContent = generateReactorFile(
          canister.name,
          methodMap,
          canister.useDisplayReactor ?? true
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
          // Trigger a full reload to regenerate
          server.restart()
        }
      }
    },
  }
}

export default icReactorPlugin
