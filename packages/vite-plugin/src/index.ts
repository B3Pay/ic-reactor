/**
 * @ic-reactor/vite-plugin
 *
 * A Vite plugin that watches .did files and automatically generates
 * type-safe ic-reactor configuration files. Designed to work seamlessly
 * with icp-cli and @icp-sdk/bindgen.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { icReactorBindgen } from "@ic-reactor/vite-plugin";
 *
 * export default defineConfig({
 *   plugins: [
 *     react(),
 *     icReactorBindgen({
 *       canisters: [
 *         { name: "backend", didPath: "../backend/dist/backend.did" }
 *       ]
 *     })
 *   ]
 * });
 * ```
 */

import type { Plugin, ViteDevServer } from "vite"
import fs from "node:fs"
import path from "node:path"
import { watch, type FSWatcher } from "chokidar"

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface CanisterConfig {
  /**
   * The name of the canister (used for naming generated files and hooks).
   * Should match the canister name in icp.toml / dfx.json
   */
  name: string

  /**
   * Path to the .did file (relative to vite.config.ts or absolute).
   * Example: "../backend/dist/backend.did"
   */
  didPath: string

  /**
   * Optional: Override the output path for the generated reactor file.
   * Defaults to: `src/generated/{name}.reactor.ts`
   */
  outputPath?: string

  /**
   * Optional: Use "display" transformation (converts bigint/Principal to strings).
   * Defaults to true for better React ergonomics.
   */
  useDisplayReactor?: boolean
}

export interface IcReactorBindgenOptions {
  /**
   * List of canisters to generate reactor files for.
   */
  canisters: CanisterConfig[]

  /**
   * Output directory for generated files.
   * Defaults to "src/generated"
   */
  outputDir?: string

  /**
   * Whether to watch for changes in development mode.
   * Defaults to true
   */
  watch?: boolean

  /**
   * Path to @icp-sdk/bindgen output for TypeScript imports.
   * Defaults to "@icp-sdk/bindgen"
   */
  bindgenImportPath?: string
}

// ═══════════════════════════════════════════════════════════════════════════
// CANDID PARSER (Simplified - extracts method names and types)
// ═══════════════════════════════════════════════════════════════════════════

interface CandidMethod {
  name: string
  isQuery: boolean
  argTypes: string[]
  returnType: string
  hasResult: boolean // Returns variant { Ok; Err }
}

interface CandidService {
  methods: CandidMethod[]
}

/**
 * Parse a simplified subset of Candid IDL to extract method signatures.
 * For production, this would use @icp-sdk/candid-parser or similar.
 */
function parseCandidFile(filePath: string): CandidService {
  const content = fs.readFileSync(filePath, "utf-8")
  const methods: CandidMethod[] = []

  // Match service method declarations
  // Pattern: method_name : (args) -> (return) query?
  const serviceMatch = content.match(/service\s*:\s*\{([^}]+)\}/)
  if (!serviceMatch) {
    console.warn(
      `[icReactorBindgen] No service definition found in ${filePath}`
    )
    return { methods: [] }
  }

  const serviceBlock = serviceMatch[1]
  const methodRegex =
    /(\w+)\s*:\s*\(([^)]*)\)\s*->\s*\(([^)]*)\)\s*(query|composite_query)?/g

  let match
  while ((match = methodRegex.exec(serviceBlock)) !== null) {
    const [, name, args, returnType, queryAnnotation] = match
    methods.push({
      name,
      isQuery:
        queryAnnotation === "query" || queryAnnotation === "composite_query",
      argTypes: args
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean),
      returnType: returnType.trim(),
      hasResult:
        returnType.includes("variant") &&
        returnType.includes("Ok") &&
        returnType.includes("Err"),
    })
  }

  return { methods }
}

// ═══════════════════════════════════════════════════════════════════════════
// CODE GENERATOR
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Convert snake_case to camelCase for hook names
 */
function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
}

/**
 * Convert snake_case to PascalCase for hook names
 */
function toPascalCase(str: string): string {
  const camel = toCamelCase(str)
  return camel.charAt(0).toUpperCase() + camel.slice(1)
}

/**
 * Generate the reactor configuration file for a canister.
 */
function generateReactorFile(
  canister: CanisterConfig,
  service: CandidService,
  options: IcReactorBindgenOptions
): string {
  const { name, useDisplayReactor = true } = canister
  const bindgenPath = options.bindgenImportPath ?? "@icp-sdk/bindgen"
  const ReactorClass = useDisplayReactor ? "DisplayReactor" : "Reactor"

  const queryMethods = service.methods.filter((m) => m.isQuery)
  const updateMethods = service.methods.filter((m) => !m.isQuery)

  // Generate imports
  const imports = `/**
 * AUTO-GENERATED BY @ic-reactor/vite-plugin
 * DO NOT EDIT MANUALLY
 *
 * Source: ${canister.didPath}
 * Generated: ${new Date().toISOString()}
 */

import {
  ClientManager,
  ${ReactorClass},
  createQuery,
  createMutation,
  createSuspenseQuery,
  createInfiniteQuery,
  createAuthHooks,
  resolveCanisterId,
  getGlobalClientManager,
} from "@ic-reactor/react"
import { idlFactory } from "${bindgenPath}/${name}"
import type { _SERVICE } from "${bindgenPath}/${name}"
import { QueryClient } from "@tanstack/react-query"
`

  // Generate reactor setup
  const reactorSetup = `
// ═══════════════════════════════════════════════════════════════════════════
// ZERO-CONFIG REACTOR SETUP
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Canister ID is resolved at runtime from:
 * 1. Document cookies (mainnet asset canister)
 * 2. Window globals (window.__icp_canister_ids__)
 * 3. Fallback to local .icp/state.json
 */
const canisterId = resolveCanisterId("${name}")

/**
 * Global query client (shared across all reactors)
 * Access via: window.__IC_REACTOR_QUERY_CLIENT__
 */
export const queryClient = getGlobalClientManager().queryClient

/**
 * Shared client manager (handles agent, auth, and identity)
 */
export const clientManager = getGlobalClientManager()

/**
 * ${toPascalCase(name)} Reactor instance
 * Pre-configured with automatic type transformations for React
 */
export const ${toCamelCase(name)}Reactor = new ${ReactorClass}<_SERVICE>({
  clientManager,
  canisterId,
  idlFactory,
  name: "${name}",
})

// ═══════════════════════════════════════════════════════════════════════════
// AUTH HOOKS (if not already created globally)
// ═══════════════════════════════════════════════════════════════════════════

export const { useAuth, useAgentState, useUserPrincipal } = createAuthHooks(clientManager)
`

  // Generate query hooks
  const queryHooks =
    queryMethods.length > 0
      ? `
// ═══════════════════════════════════════════════════════════════════════════
// QUERY HOOKS (auto-generated from Candid query methods)
// ═══════════════════════════════════════════════════════════════════════════
${queryMethods
  .map((m) => {
    const hookName = `use${toPascalCase(m.name)}`
    const queryName = `${toCamelCase(m.name)}Query`
    return `
/**
 * Query: ${m.name}
 * ${m.argTypes.length > 0 ? `Args: (${m.argTypes.join(", ")})` : "No arguments"}
 * Returns: ${m.returnType}
 */
export const ${queryName} = createQuery(${toCamelCase(name)}Reactor, {
  functionName: "${m.name}",
})
export const ${hookName} = ${queryName}.useQuery
export const ${hookName}Suspense = createSuspenseQuery(${toCamelCase(name)}Reactor, {
  functionName: "${m.name}",
}).useSuspenseQuery
`
  })
  .join("")}`
      : ""

  // Generate mutation hooks
  const mutationHooks =
    updateMethods.length > 0
      ? `
// ═══════════════════════════════════════════════════════════════════════════
// MUTATION HOOKS (auto-generated from Candid update methods)
// ═══════════════════════════════════════════════════════════════════════════
${updateMethods
  .map((m) => {
    const hookName = `use${toPascalCase(m.name)}`
    const mutationName = `${toCamelCase(m.name)}Mutation`
    return `
/**
 * Update: ${m.name}
 * ${m.argTypes.length > 0 ? `Args: (${m.argTypes.join(", ")})` : "No arguments"}
 * Returns: ${m.returnType}
 */
export const ${mutationName} = createMutation(${toCamelCase(name)}Reactor, {
  functionName: "${m.name}",
})
export const ${hookName} = ${mutationName}.useMutation
`
  })
  .join("")}`
      : ""

  // Generate exports
  const exports = `
// ═══════════════════════════════════════════════════════════════════════════
// CONVENIENCE EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export { idlFactory, canisterId }
export type { _SERVICE as ${toPascalCase(name)}Service }

/**
 * Direct reactor access for advanced use cases
 */
export const reactor = ${toCamelCase(name)}Reactor
`

  return imports + reactorSetup + queryHooks + mutationHooks + exports
}

// ═══════════════════════════════════════════════════════════════════════════
// VITE PLUGIN
// ═══════════════════════════════════════════════════════════════════════════

export function icReactorBindgen(options: IcReactorBindgenOptions): Plugin {
  const {
    canisters,
    outputDir = "src/generated",
    watch: shouldWatch = true,
  } = options
  let root: string
  let watcher: FSWatcher | null = null

  /**
   * Generate reactor file for a single canister
   */
  function generateForCanister(canister: CanisterConfig) {
    const didPath = path.isAbsolute(canister.didPath)
      ? canister.didPath
      : path.resolve(root, canister.didPath)

    if (!fs.existsSync(didPath)) {
      console.warn(`[icReactorBindgen] .did file not found: ${didPath}`)
      console.warn(
        `[icReactorBindgen] Run 'icp build' to generate the .did file`
      )
      return
    }

    try {
      const service = parseCandidFile(didPath)
      const code = generateReactorFile(canister, service, options)

      const outputPath =
        canister.outputPath ??
        path.resolve(root, outputDir, `${canister.name}.reactor.ts`)

      // Ensure output directory exists
      fs.mkdirSync(path.dirname(outputPath), { recursive: true })

      // Write the generated file
      fs.writeFileSync(outputPath, code, "utf-8")

      console.log(
        `[icReactorBindgen] ✅ Generated: ${path.relative(root, outputPath)}`
      )
      console.log(
        `[icReactorBindgen]    Methods: ${service.methods.length} (${service.methods.filter((m) => m.isQuery).length} queries, ${service.methods.filter((m) => !m.isQuery).length} updates)`
      )
    } catch (error) {
      console.error(
        `[icReactorBindgen] ❌ Failed to generate for ${canister.name}:`,
        error
      )
    }
  }

  /**
   * Generate all reactor files
   */
  function generateAll() {
    console.log(`[icReactorBindgen] 🔄 Generating reactor files...`)
    for (const canister of canisters) {
      generateForCanister(canister)
    }
  }

  return {
    name: "ic-reactor-bindgen",

    configResolved(config) {
      root = config.root
    },

    buildStart() {
      generateAll()
    },

    configureServer(server: ViteDevServer) {
      if (!shouldWatch) return

      // Watch .did files for changes
      const didPaths = canisters.map((c) =>
        path.isAbsolute(c.didPath) ? c.didPath : path.resolve(root, c.didPath)
      )

      watcher = watch(didPaths, {
        ignoreInitial: true,
        awaitWriteFinish: {
          stabilityThreshold: 100,
          pollInterval: 50,
        },
      })

      watcher.on("change", (changedPath) => {
        console.log(
          `[icReactorBindgen] 📝 .did file changed: ${path.basename(changedPath)}`
        )

        // Find the canister that matches this .did file
        const canister = canisters.find((c) => {
          const didPath = path.isAbsolute(c.didPath)
            ? c.didPath
            : path.resolve(root, c.didPath)
          return didPath === changedPath
        })

        if (canister) {
          generateForCanister(canister)

          // Trigger HMR by invalidating the generated module
          const outputPath =
            canister.outputPath ??
            path.resolve(root, outputDir, `${canister.name}.reactor.ts`)

          const module = server.moduleGraph.getModuleById(outputPath)
          if (module) {
            server.moduleGraph.invalidateModule(module)
            server.ws.send({ type: "full-reload" })
          }
        }
      })

      watcher.on("add", (addedPath) => {
        console.log(
          `[icReactorBindgen] 🆕 .did file created: ${path.basename(addedPath)}`
        )
        generateAll()
      })

      console.log(
        `[icReactorBindgen] 👀 Watching ${didPaths.length} .did file(s) for changes`
      )
    },

    closeBundle() {
      if (watcher) {
        watcher.close()
      }
    },
  }
}

export default icReactorBindgen
