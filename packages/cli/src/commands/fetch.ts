/**
 * Fetch command
 *
 * Fetch Candid interface from a live canister and generate hooks.
 */

import * as p from "@clack/prompts"
import fs from "node:fs"
import path from "node:path"
import pc from "picocolors"
import {
  loadConfig,
  saveConfig,
  getProjectRoot,
  ensureDir,
  findConfigFile,
  CONFIG_FILE_NAME,
  DEFAULT_CONFIG,
} from "../utils/config.js"
import { formatMethodForDisplay } from "../parsers/did.js"
import {
  generateQueryHook,
  generateMutationHook,
  generateInfiniteQueryHook,
} from "../generators/index.js"
import { getHookFileName, toCamelCase } from "../utils/naming.js"
import {
  fetchCandidFromCanister,
  isValidCanisterId,
  shortenCanisterId,
  type NetworkType,
} from "../utils/network.js"
import type {
  MethodInfo,
  HookType,
  ReactorConfig,
  CanisterConfig,
} from "../types.js"

interface FetchOptions {
  canisterId?: string
  network?: NetworkType
  name?: string
  methods?: string[]
  all?: boolean
}

export async function fetchCommand(options: FetchOptions) {
  console.log()
  p.intro(pc.cyan("🌐 Fetch from Live Canister"))

  const projectRoot = getProjectRoot()

  // Get canister ID
  let canisterId = options.canisterId

  if (!canisterId) {
    const input = await p.text({
      message: "Enter canister ID",
      placeholder: "ryjl3-tyaaa-aaaaa-aaaba-cai",
      validate: (value) => {
        if (!value) return "Canister ID is required"
        if (!isValidCanisterId(value)) {
          return "Invalid canister ID format"
        }
        return undefined
      },
    })

    if (p.isCancel(input)) {
      p.cancel("Cancelled.")
      process.exit(0)
    }

    canisterId = input as string
  }

  // Validate canister ID
  if (!isValidCanisterId(canisterId)) {
    p.log.error(`Invalid canister ID: ${pc.yellow(canisterId)}`)
    process.exit(1)
  }

  // Get network
  let network = options.network

  if (!network) {
    const result = await p.select({
      message: "Select network",
      options: [
        { value: "ic", label: "IC Mainnet", hint: "icp-api.io" },
        { value: "local", label: "Local Replica", hint: "localhost:4943" },
      ],
    })

    if (p.isCancel(result)) {
      p.cancel("Cancelled.")
      process.exit(0)
    }

    network = result as NetworkType
  }

  // Fetch Candid from canister
  const spinner = p.spinner()
  spinner.start(`Fetching Candid from ${shortenCanisterId(canisterId)}...`)

  let candidResult
  try {
    candidResult = await fetchCandidFromCanister({
      canisterId,
      network,
    })
    spinner.stop(
      `Found ${pc.green(candidResult.methods.length.toString())} methods`
    )
  } catch (error) {
    spinner.stop("Failed to fetch Candid")
    p.log.error((error as Error).message)
    process.exit(1)
  }

  const { methods, candidSource } = candidResult

  if (methods.length === 0) {
    p.log.warn("No methods found in canister interface")
    process.exit(0)
  }

  // Get canister name
  let canisterName = options.name

  if (!canisterName) {
    const input = await p.text({
      message: "Name for this canister (used in generated code)",
      placeholder: toCamelCase(canisterId.split("-")[0]),
      defaultValue: toCamelCase(canisterId.split("-")[0]),
      validate: (value) => {
        if (!value) return "Name is required"
        if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(value)) {
          return "Name must start with a letter and contain only letters, numbers, hyphens, and underscores"
        }
        return undefined
      },
    })

    if (p.isCancel(input)) {
      p.cancel("Cancelled.")
      process.exit(0)
    }

    canisterName = input as string
  }

  // Select methods
  let selectedMethods: MethodInfo[]

  if (options.all) {
    selectedMethods = methods
  } else if (options.methods && options.methods.length > 0) {
    selectedMethods = methods.filter((m) => options.methods!.includes(m.name))
    const notFound = options.methods.filter(
      (name) => !methods.some((m) => m.name === name)
    )
    if (notFound.length > 0) {
      p.log.warn(`Methods not found: ${pc.yellow(notFound.join(", "))}`)
    }
  } else {
    // Interactive selection
    const result = await p.multiselect({
      message: "Select methods to generate hooks for",
      options: methods.map((method) => ({
        value: method.name,
        label: formatMethodForDisplay(method),
      })),
      required: true,
    })

    if (p.isCancel(result)) {
      p.cancel("Cancelled.")
      process.exit(0)
    }

    selectedMethods = methods.filter((m) =>
      (result as string[]).includes(m.name)
    )
  }

  if (selectedMethods.length === 0) {
    p.log.warn("No methods selected.")
    process.exit(0)
  }

  // Prompt for hook types for query methods
  const methodsWithHookTypes: Array<{
    method: MethodInfo
    hookType: HookType
  }> = []

  for (const method of selectedMethods) {
    if (method.type === "query") {
      const hookType = await p.select({
        message: `Hook type for ${pc.cyan(method.name)}`,
        options: [
          { value: "query", label: "Query", hint: "Standard query hook" },
          {
            value: "suspenseQuery",
            label: "Suspense Query",
            hint: "For React Suspense",
          },
          {
            value: "infiniteQuery",
            label: "Infinite Query",
            hint: "Paginated/infinite scroll",
          },
          {
            value: "suspenseInfiniteQuery",
            label: "Suspense Infinite Query",
            hint: "Paginated with Suspense",
          },
        ],
      })

      if (p.isCancel(hookType)) {
        p.cancel("Cancelled.")
        process.exit(0)
      }

      methodsWithHookTypes.push({ method, hookType: hookType as HookType })
    } else {
      methodsWithHookTypes.push({ method, hookType: "mutation" })
    }
  }

  // Load or create config
  let configPath = findConfigFile()
  let config: ReactorConfig

  if (!configPath) {
    // Create default config
    configPath = path.join(projectRoot, CONFIG_FILE_NAME)
    config = { ...DEFAULT_CONFIG }
    p.log.info(`Creating ${pc.yellow(CONFIG_FILE_NAME)}`)
  } else {
    config = loadConfig(configPath) ?? { ...DEFAULT_CONFIG }
  }

  // Add canister to config
  const canisterConfig: CanisterConfig = {
    didFile: `./candid/${canisterName}.did`,
    clientManagerPath: "../../lib/client",
    useDisplayReactor: true,
    canisterId: canisterId,
  }

  config.canisters[canisterName] = canisterConfig

  // Generate files
  const canisterOutDir = path.join(projectRoot, config.outDir, canisterName)
  const hooksOutDir = path.join(canisterOutDir, "hooks")
  const candidDir = path.join(projectRoot, "candid")

  ensureDir(hooksOutDir)
  ensureDir(candidDir)

  const genSpinner = p.spinner()
  genSpinner.start("Generating hooks...")

  const generatedFiles: string[] = []

  // Save the Candid source file
  const candidPath = path.join(candidDir, `${canisterName}.did`)
  fs.writeFileSync(candidPath, candidSource)
  generatedFiles.push(`candid/${canisterName}.did`)

  // Generate reactor.ts
  const reactorPath = path.join(canisterOutDir, "reactor.ts")
  const reactorContent = generateReactorFileForFetch({
    canisterName,
    canisterConfig,
    canisterId,
  })
  fs.writeFileSync(reactorPath, reactorContent)
  generatedFiles.push("reactor.ts")

  // Generate hooks for each method
  for (const { method, hookType } of methodsWithHookTypes) {
    const fileName = getHookFileName(method.name, hookType)
    const filePath = path.join(hooksOutDir, fileName)

    let content: string

    switch (hookType) {
      case "query":
      case "suspenseQuery":
        content = generateQueryHook({
          canisterName,
          method,
          config,
        })
        break
      case "infiniteQuery":
      case "suspenseInfiniteQuery":
        content = generateInfiniteQueryHook({
          canisterName,
          method,
          config,
        })
        break
      case "mutation":
        content = generateMutationHook({
          canisterName,
          method,
          config,
        })
        break
    }

    fs.writeFileSync(filePath, content)
    generatedFiles.push(path.join("hooks", fileName))
  }

  // Generate index.ts barrel export
  const indexPath = path.join(hooksOutDir, "index.ts")
  const indexContent = generateIndexFile(methodsWithHookTypes)
  fs.writeFileSync(indexPath, indexContent)
  generatedFiles.push("hooks/index.ts")

  // Update config with generated hooks
  config.generatedHooks[canisterName] = [
    ...new Set([
      ...(config.generatedHooks[canisterName] ?? []),
      ...selectedMethods.map((m) => m.name),
    ]),
  ]
  saveConfig(config, configPath)

  genSpinner.stop("Hooks generated!")

  // Display results
  console.log()
  p.note(
    generatedFiles.map((f) => pc.green(`✓ ${f}`)).join("\n"),
    `Generated in ${pc.dim(path.relative(projectRoot, canisterOutDir))}`
  )

  console.log()
  p.note(
    `Canister ID: ${pc.cyan(canisterId)}\n` +
      `Network: ${pc.yellow(network)}\n` +
      `Name: ${pc.green(canisterName)}\n` +
      `Methods: ${pc.dim(selectedMethods.map((m) => m.name).join(", "))}`,
    "Canister Info"
  )

  p.outro(pc.green("✓ Done!"))
}

/**
 * Generate reactor file specifically for fetched canisters
 * (with canister ID hardcoded or from environment)
 */
function generateReactorFileForFetch(options: {
  canisterName: string
  canisterConfig: CanisterConfig
  canisterId: string
}): string {
  const { canisterName, canisterConfig, canisterId } = options

  const pascalName =
    canisterName.charAt(0).toUpperCase() + canisterName.slice(1)
  const reactorName = `${canisterName}Reactor`
  const serviceName = `${pascalName}Service`
  const reactorType =
    canisterConfig.useDisplayReactor !== false ? "DisplayReactor" : "Reactor"

  const clientManagerPath =
    canisterConfig.clientManagerPath ?? "../../lib/client"

  return `/**
 * ${pascalName} Reactor
 *
 * Auto-generated by @ic-reactor/cli
 * Fetched from canister: ${canisterId}
 *
 * You can customize this file to add global configuration.
 */

import { ${reactorType}, createActorHooks, createAuthHooks } from "@ic-reactor/react"
import { clientManager } from "${clientManagerPath}"

// Import generated declarations
// Note: You may need to run 'npx @icp-sdk/bindgen' to generate TypeScript types
// For now, we use a generic service type
import { idlFactory } from "./declarations/${canisterName}.did"

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE TYPE
// ═══════════════════════════════════════════════════════════════════════════

// TODO: Generate proper types using @icp-sdk/bindgen
// npx @icp-sdk/bindgen --input ./candid/${canisterName}.did --output ./src/canisters/${canisterName}/declarations
type ${serviceName} = Record<string, (...args: unknown[]) => Promise<unknown>>

// ═══════════════════════════════════════════════════════════════════════════
// REACTOR INSTANCE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ${pascalName} Reactor
 *
 * Canister ID: ${canisterId}
 */
export const ${reactorName} = new ${reactorType}<${serviceName}>({
  clientManager,
  idlFactory,
  canisterId: "${canisterId}",
  name: "${canisterName}",
})

// ═══════════════════════════════════════════════════════════════════════════
// BASE HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Base actor hooks - use these directly or import method-specific hooks.
 */
export const {
  useActorQuery,
  useActorMutation,
  useActorSuspenseQuery,
  useActorInfiniteQuery,
  useActorSuspenseInfiniteQuery,
  useActorMethod,
} = createActorHooks(${reactorName})

/**
 * Auth hooks for the client manager.
 */
export const { useAuth, useAgentState, useUserPrincipal } = createAuthHooks(clientManager)

// ═══════════════════════════════════════════════════════════════════════════
// RE-EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export { idlFactory }
export type { ${serviceName} }
`
}

function generateIndexFile(
  methods: Array<{ method: MethodInfo; hookType: HookType }>
): string {
  const exports = methods.map(({ method, hookType }) => {
    const fileName = getHookFileName(method.name, hookType).replace(".ts", "")
    return `export * from "./${fileName}"`
  })

  return `/**
 * Hook barrel exports
 *
 * Auto-generated by @ic-reactor/cli
 */

${exports.join("\n")}
`
}
