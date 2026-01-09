/**
 * @ic-reactor/vite-plugin
 *
 * A Vite plugin that generates ic-reactor hooks from Candid .did files.
 * Works seamlessly with @icp-sdk/bindgen for type generation.
 *
 * Design Philosophy:
 * - User owns the ClientManager and QueryClient (configured in their own file)
 * - Plugin ONLY generates: reactor instance + hooks
 * - Uses @icp-sdk/bindgen for idlFactory and types
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
 *         {
 *           name: "backend",
 *           didPath: "../backend/backend.did",
 *           clientManagerPath: "../lib/client"  // User provides their own
 *         }
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
   * Example: "../backend/backend.did"
   */
  didPath: string

  /**
   * Optional: Override the output path for the generated reactor file.
   * Defaults to: `{outputDir}/{name}/index.ts`
   */
  outputPath?: string

  /**
   * Optional: Use "display" transformation (converts bigint/Principal to strings).
   * Defaults to true for better React ergonomics.
   */
  useDisplayReactor?: boolean

  /**
   * Path to import ClientManager from (relative to generated file).
   * The file at this path should export: { clientManager: ClientManager }
   * Default: "../../lib/client"
   */
  clientManagerPath?: string
}

export interface IcReactorBindgenOptions {
  /**
   * List of canisters to generate reactor files for.
   */
  canisters: CanisterConfig[]

  /**
   * Output directory for generated files.
   * Defaults to "src/canisters"
   */
  outputDir?: string

  /**
   * Whether to watch for changes in development mode.
   * Defaults to true
   */
  watch?: boolean
}

// ═══════════════════════════════════════════════════════════════════════════
// CANDID PARSER
// ═══════════════════════════════════════════════════════════════════════════

interface CandidMethod {
  name: string
  isQuery: boolean
  argTypes: string[]
  returnType: string
  hasResult: boolean
}

interface CandidService {
  methods: CandidMethod[]
}

/**
 * Parse a Candid IDL file to extract method signatures.
 */
function parseCandidFile(filePath: string): CandidService {
  const content = fs.readFileSync(filePath, "utf-8")
  const methods: CandidMethod[] = []

  // Match service method declarations
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

function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
}

function toPascalCase(str: string): string {
  const camel = toCamelCase(str)
  return camel.charAt(0).toUpperCase() + camel.slice(1)
}

/**
 * Generate the reactor configuration file for a canister.
 */
function generateReactorFile(
  canister: CanisterConfig,
  service: CandidService
): string {
  const {
    name,
    useDisplayReactor = true,
    clientManagerPath = "../../lib/client",
  } = canister
  const ReactorClass = useDisplayReactor ? "DisplayReactor" : "Reactor"

  const queryMethods = service.methods.filter((m) => m.isQuery)
  const updateMethods = service.methods.filter((m) => !m.isQuery)

  // Track query keys for cache invalidation
  const queryKeys: string[] = []

  // Generate query hooks
  const queryHooks = queryMethods
    .map((m) => {
      const hookName = `use${toPascalCase(m.name)}`
      const queryName = `${toCamelCase(m.name)}Query`
      const hasArgs = m.argTypes.length > 0
      queryKeys.push(m.name)

      if (hasArgs) {
        return `
/**
 * Query: ${m.name}
 * Args: (${m.argTypes.join(", ")})
 * Returns: ${m.returnType}
 */
export const ${queryName} = createQueryFactory(${toCamelCase(name)}Reactor, {
  functionName: "${m.name}",
})
export const ${hookName} = (options: { args: Parameters<_SERVICE["${m.name}"]> } & Record<string, unknown> = { args: [] as any }) =>
  ${queryName}(options.args).useQuery(options)
export const ${hookName}Suspense = (options: { args: Parameters<_SERVICE["${m.name}"]> } & Record<string, unknown> = { args: [] as any }) =>
  createSuspenseQuery(${toCamelCase(name)}Reactor, { functionName: "${m.name}" }).useSuspenseQuery(options)
`
      } else {
        return `
/**
 * Query: ${m.name}
 * No arguments
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
      }
    })
    .join("")

  // Generate mutation hooks
  const mutationHooks = updateMethods
    .map((m) => {
      const hookName = `use${toPascalCase(m.name)}`
      const mutationName = `${toCamelCase(m.name)}Mutation`

      // Find related queries to invalidate
      const relatedQueries = queryKeys
        .filter((q) =>
          q
            .toLowerCase()
            .includes(
              m.name
                .replace(/^(set_|update_|delete_|add_|create_|remove_)/, "")
                .toLowerCase()
            )
        )
        .map((q) => `${toCamelCase(q)}Query.getQueryKey()`)

      return `
/**
 * Mutation: ${m.name}
 * ${m.argTypes.length > 0 ? `Args: (${m.argTypes.join(", ")})` : "No arguments"}
 * Returns: ${m.returnType}
 */
export const ${mutationName} = createMutation(${toCamelCase(name)}Reactor, {
  functionName: "${m.name}",${
    relatedQueries.length > 0
      ? `
  invalidateQueries: [${relatedQueries.join(", ")}],`
      : ""
  }
})
export const ${hookName} = ${mutationName}.useMutation
`
    })
    .join("")

  return `/* eslint-disable */
// @ts-nocheck

/**
 * AUTO-GENERATED BY @ic-reactor/vite-plugin
 * DO NOT EDIT MANUALLY
 *
 * Source: ${canister.didPath}
 * Generated: ${new Date().toISOString()}
 *
 * This file provides type-safe React hooks for interacting with the
 * ${name} canister using ic-reactor.
 */

import {
  ${ReactorClass},
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
import { idlFactory, type _SERVICE } from "./declarations/${name}.did"

// ═══════════════════════════════════════════════════════════════════════════
// CANISTER ID RESOLUTION
// ═══════════════════════════════════════════════════════════════════════════

interface ${toPascalCase(name)}CanisterEnv {
  readonly "PUBLIC_CANISTER_ID:${name}": string
}

/**
 * Get canister ID from runtime environment (ic_env cookie)
 */
function get${toPascalCase(name)}CanisterId(): string {
  const env = safeGetCanisterEnv<${toPascalCase(name)}CanisterEnv>()

  if (env?.["PUBLIC_CANISTER_ID:${name}"]) {
    return env["PUBLIC_CANISTER_ID:${name}"]
  }

  console.warn("[ic-reactor] ${name} canister ID not found in ic_env cookie")
  return "aaaaa-aa" // Fallback
}

// ═══════════════════════════════════════════════════════════════════════════
// REACTOR INSTANCE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ${toPascalCase(name)} Reactor with ${useDisplayReactor ? "Display" : "Candid"} type transformations.
 * ${useDisplayReactor ? "Automatically converts bigint → string, Principal → string, etc." : "Uses raw Candid types."}
 */
export const ${toCamelCase(name)}Reactor = new ${ReactorClass}<_SERVICE>({
  clientManager,
  canisterId: get${toPascalCase(name)}CanisterId(),
  idlFactory,
  name: "${name}",
})

// ═══════════════════════════════════════════════════════════════════════════
// QUERY HOOKS
// ═══════════════════════════════════════════════════════════════════════════
${queryHooks}

// ═══════════════════════════════════════════════════════════════════════════
// MUTATION HOOKS
// ═══════════════════════════════════════════════════════════════════════════
${mutationHooks}

// ═══════════════════════════════════════════════════════════════════════════
// RE-EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export { idlFactory }
export type { _SERVICE as ${toPascalCase(name)}Service }
export { ${toCamelCase(name)}Reactor as reactor }
`
}

// ═══════════════════════════════════════════════════════════════════════════
// BINDGEN INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Run @icp-sdk/bindgen to generate declarations
 */
async function runBindgen(
  didPath: string,
  outDir: string,
  canisterName: string
): Promise<void> {
  // Try to dynamically import @icp-sdk/bindgen
  // Use a variable to prevent TypeScript from trying to resolve the module
  const bindgenModule = "@icp-sdk/bindgen/core"
  try {
    const { generate } = (await import(/* @vite-ignore */ bindgenModule)) as {
      generate: (options: { didFile: string; outDir: string }) => Promise<void>
    }

    // Clean existing declarations before regenerating
    if (fs.existsSync(outDir)) {
      fs.rmSync(outDir, { recursive: true, force: true })
    }
    fs.mkdirSync(outDir, { recursive: true })

    await generate({
      didFile: didPath,
      outDir,
    })

    // Remove the actor file that bindgen generates - we don't need it
    const actorFilePath = path.join(outDir, `${canisterName}.ts`)
    if (fs.existsSync(actorFilePath)) {
      fs.unlinkSync(actorFilePath)
    }
  } catch (error) {
    console.warn(`[icReactorBindgen] Could not run @icp-sdk/bindgen: ${error}`)
    console.warn(`[icReactorBindgen] Make sure @icp-sdk/bindgen is installed`)
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// VITE PLUGIN
// ═══════════════════════════════════════════════════════════════════════════

export function icReactorBindgen(options: IcReactorBindgenOptions): Plugin {
  const {
    canisters,
    outputDir = "src/canisters",
    watch: shouldWatch = true,
  } = options
  let root: string
  let watcher: FSWatcher | null = null

  /**
   * Generate reactor file for a single canister
   */
  async function generateForCanister(canister: CanisterConfig) {
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
      // Determine output directory for this canister
      const canisterOutDir = canister.outputPath
        ? path.dirname(path.resolve(root, canister.outputPath))
        : path.resolve(root, outputDir, canister.name)

      // Step 1: Run bindgen to generate declarations
      const declarationsDir = path.join(canisterOutDir, "declarations")
      await runBindgen(didPath, declarationsDir, canister.name)
      console.log(
        `[icReactorBindgen] ✅ Declarations generated at ${path.relative(root, declarationsDir)}`
      )

      // Step 2: Parse the .did file
      const service = parseCandidFile(didPath)
      console.log(
        `[icReactorBindgen]    Methods: ${service.methods.length} (${service.methods.filter((m) => m.isQuery).length} queries, ${service.methods.filter((m) => !m.isQuery).length} updates)`
      )

      // Step 3: Generate the reactor file
      const code = generateReactorFile(canister, service)

      const outputPath =
        canister.outputPath ??
        path.resolve(root, outputDir, canister.name, "index.ts")

      // Ensure output directory exists
      fs.mkdirSync(path.dirname(outputPath), { recursive: true })

      // Write the generated file
      fs.writeFileSync(outputPath, code, "utf-8")

      console.log(
        `[icReactorBindgen] ✅ Generated: ${path.relative(root, outputPath)}`
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
  async function generateAll() {
    console.log(`[icReactorBindgen] 🔄 Generating reactor files...`)
    for (const canister of canisters) {
      await generateForCanister(canister)
    }
  }

  return {
    name: "ic-reactor-bindgen",

    configResolved(config) {
      root = config.root
    },

    async buildStart() {
      await generateAll()
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

      watcher.on("change", async (changedPath) => {
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
          await generateForCanister(canister)

          // Trigger HMR by sending full reload
          server.ws.send({ type: "full-reload" })
        }
      })

      watcher.on("add", async (addedPath) => {
        console.log(
          `[icReactorBindgen] 🆕 .did file created: ${path.basename(addedPath)}`
        )
        await generateAll()
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
