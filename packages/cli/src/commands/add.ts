/**
 * Add command
 *
 * Interactively add hooks for canister methods.
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
  fileExists,
  findConfigFile,
} from "../utils/config.js"
import { parseDIDFile, formatMethodForDisplay } from "../parsers/did.js"
import {
  generateReactorFile,
  generateQueryHook,
  generateMutationHook,
  generateInfiniteQueryHook,
} from "../generators/index.js"
import { getHookFileName } from "../utils/naming.js"
import { generateDeclarations } from "../utils/bindgen.js"
import type { MethodInfo, HookType } from "../types.js"

interface AddOptions {
  canister?: string
  methods?: string[]
  all?: boolean
}

export async function addCommand(options: AddOptions) {
  console.log()
  p.intro(pc.cyan("🔧 Add Canister Hooks"))

  // Load config
  const configPath = findConfigFile()
  if (!configPath) {
    p.log.error(
      `No ${pc.yellow("reactor.config.json")} found. Run ${pc.cyan("npx @ic-reactor/cli init")} first.`
    )
    process.exit(1)
  }

  const config = loadConfig(configPath)
  if (!config) {
    p.log.error(`Failed to load config from ${pc.yellow(configPath)}`)
    process.exit(1)
  }

  const projectRoot = getProjectRoot()
  const canisterNames = Object.keys(config.canisters)

  // Check if we have any canisters configured
  if (canisterNames.length === 0) {
    p.log.error(
      `No canisters configured. Add a canister to ${pc.yellow("reactor.config.json")} first.`
    )

    const addNow = await p.confirm({
      message: "Would you like to add a canister now?",
      initialValue: true,
    })

    if (p.isCancel(addNow) || !addNow) {
      process.exit(1)
    }

    // Prompt for canister info
    const canisterInfo = await promptForNewCanister(projectRoot)
    if (!canisterInfo) {
      p.cancel("Cancelled.")
      process.exit(0)
    }

    config.canisters[canisterInfo.name] = canisterInfo.config
    saveConfig(config, configPath)
    canisterNames.push(canisterInfo.name)
  }

  // Select canister
  let selectedCanister = options.canister

  if (!selectedCanister) {
    if (canisterNames.length === 1) {
      selectedCanister = canisterNames[0]
    } else {
      const result = await p.select({
        message: "Select a canister",
        options: canisterNames.map((name) => ({
          value: name,
          label: name,
        })),
      })

      if (p.isCancel(result)) {
        p.cancel("Cancelled.")
        process.exit(0)
      }

      selectedCanister = result as string
    }
  }

  const canisterConfig = config.canisters[selectedCanister]
  if (!canisterConfig) {
    p.log.error(`Canister ${pc.yellow(selectedCanister)} not found in config.`)
    process.exit(1)
  }

  // Parse DID file
  const didFilePath = path.resolve(projectRoot, canisterConfig.didFile)
  let methods: MethodInfo[]

  try {
    methods = parseDIDFile(didFilePath)
  } catch (error) {
    p.log.error(
      `Failed to parse DID file: ${pc.yellow(didFilePath)}\n${(error as Error).message}`
    )
    process.exit(1)
  }

  if (methods.length === 0) {
    p.log.warn(`No methods found in ${pc.yellow(didFilePath)}`)
    process.exit(0)
  }

  p.log.info(
    `Found ${pc.green(methods.length.toString())} methods in ${pc.dim(selectedCanister)}`
  )

  // Select methods
  let selectedMethods: MethodInfo[]

  if (options.all) {
    selectedMethods = methods
  } else if (options.methods && options.methods.length > 0) {
    // Parse comma-separated method names
    const requestedMethods = options.methods
      .flatMap((m) => m.split(","))
      .map((m) => m.trim())
      .filter((m) => m.length > 0)

    selectedMethods = methods.filter((m) => requestedMethods.includes(m.name))
    const notFound = requestedMethods.filter(
      (name) => !methods.some((m) => m.name === name)
    )
    if (notFound.length > 0) {
      p.log.warn(`Methods not found: ${pc.yellow(notFound.join(", "))}`)
    }
  } else {
    // Interactive selection
    const alreadyGenerated = config.generatedHooks[selectedCanister] ?? []

    const result = await p.multiselect({
      message: "Select methods to add hooks for",
      options: methods.map((method) => {
        const isGenerated = alreadyGenerated.includes(method.name)
        return {
          value: method.name,
          label: formatMethodForDisplay(method),
          hint: isGenerated ? pc.dim("(already generated)") : undefined,
        }
      }),
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
          {
            value: "skip",
            label: "Skip",
            hint: "Don't generate hook for this method",
          },
        ],
      })

      if (p.isCancel(hookType)) {
        p.cancel("Cancelled.")
        process.exit(0)
      }

      // Skip this method if user chose "skip"
      if (hookType === "skip") {
        p.log.info(`Skipping ${pc.dim(method.name)}`)
        continue
      }

      methodsWithHookTypes.push({ method, hookType: hookType as HookType })
    } else {
      // For mutations, also allow skipping
      const hookType = await p.select({
        message: `Hook type for ${pc.yellow(method.name)} (mutation)`,
        options: [
          {
            value: "mutation",
            label: "Mutation",
            hint: "Standard mutation hook",
          },
          {
            value: "skip",
            label: "Skip",
            hint: "Don't generate hook for this method",
          },
        ],
      })

      if (p.isCancel(hookType)) {
        p.cancel("Cancelled.")
        process.exit(0)
      }

      if (hookType === "skip") {
        p.log.info(`Skipping ${pc.dim(method.name)}`)
        continue
      }

      methodsWithHookTypes.push({ method, hookType: "mutation" })
    }
  }

  // Check if any methods were selected after skipping
  if (methodsWithHookTypes.length === 0) {
    p.log.warn("All methods were skipped. Nothing to generate.")
    process.exit(0)
  }

  // Generate files
  const canisterOutDir = path.join(projectRoot, config.outDir, selectedCanister)
  const hooksOutDir = path.join(canisterOutDir, "hooks")
  ensureDir(hooksOutDir)

  const spinner = p.spinner()
  spinner.start("Generating hooks...")

  const generatedFiles: string[] = []

  // Generate reactor.ts if it doesn't exist
  const reactorPath = path.join(canisterOutDir, "reactor.ts")
  if (!fileExists(reactorPath)) {
    // Generate TypeScript declarations using bindgen
    spinner.message("Generating TypeScript declarations...")
    const bindgenResult = await generateDeclarations({
      didFile: didFilePath,
      outDir: canisterOutDir,
      canisterName: selectedCanister,
    })

    if (bindgenResult.success) {
      generatedFiles.push("declarations/")
    } else {
      p.log.warn(`Could not generate declarations: ${bindgenResult.error}`)
      p.log.info(
        `You can manually run: npx @icp-sdk/bindgen --input ${didFilePath} --output ${canisterOutDir}/declarations`
      )
    }

    spinner.message("Generating reactor...")
    const reactorContent = generateReactorFile({
      canisterName: selectedCanister,
      canisterConfig: canisterConfig,
      config: config,
      outDir: canisterOutDir,
      hasDeclarations: bindgenResult.success,
    })
    fs.writeFileSync(reactorPath, reactorContent)
    generatedFiles.push("reactor.ts")
  }

  // Generate hooks for each method
  for (const { method, hookType } of methodsWithHookTypes) {
    const fileName = getHookFileName(method.name, hookType)
    const filePath = path.join(hooksOutDir, fileName)

    let content: string

    switch (hookType) {
      case "query":
      case "suspenseQuery":
        content = generateQueryHook({
          canisterName: selectedCanister,
          method,
          config,
        })
        break
      case "infiniteQuery":
      case "suspenseInfiniteQuery":
        content = generateInfiniteQueryHook({
          canisterName: selectedCanister,
          method,
          config,
        })
        break
      case "mutation":
        content = generateMutationHook({
          canisterName: selectedCanister,
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
  let existingExports: string[] = []

  if (fs.existsSync(indexPath)) {
    const content = fs.readFileSync(indexPath, "utf-8")
    existingExports = content
      .split("\n")
      .filter((line) => line.trim().startsWith("export * from"))
      .map((line) => line.trim())
  }

  const newExports = methodsWithHookTypes.map(({ method, hookType }) => {
    const fileName = getHookFileName(method.name, hookType).replace(".ts", "")
    return `export * from "./${fileName}"`
  })

  const allExports = [...new Set([...existingExports, ...newExports])]

  const indexContent = `/**
 * Hook barrel exports
 *
 * Auto-generated by @ic-reactor/cli
 */

${allExports.join("\n")}
`
  fs.writeFileSync(indexPath, indexContent)
  generatedFiles.push("hooks/index.ts")

  // Update config with generated hooks
  const existingHooks = config.generatedHooks[selectedCanister] ?? []

  const newHookConfigs = methodsWithHookTypes.map(({ method, hookType }) => ({
    name: method.name,
    type: hookType,
  }))

  const filteredExisting = existingHooks.filter((h) => {
    const name = typeof h === "string" ? h : h.name
    return !newHookConfigs.some((n) => n.name === name)
  })

  config.generatedHooks[selectedCanister] = [
    ...filteredExisting,
    ...newHookConfigs,
  ]
  saveConfig(config, configPath)

  spinner.stop("Hooks generated!")

  // Display results
  console.log()
  p.note(
    generatedFiles.map((f) => pc.green(`✓ ${f}`)).join("\n"),
    `Generated in ${pc.dim(path.relative(projectRoot, canisterOutDir))}`
  )

  p.outro(pc.green("✓ Done!"))
}

async function promptForNewCanister(projectRoot: string) {
  const name = await p.text({
    message: "Canister name",
    placeholder: "backend",
    validate: (value) => {
      if (!value) return "Canister name is required"
      return undefined
    },
  })

  if (p.isCancel(name)) return null

  const didFile = await p.text({
    message: "Path to .did file",
    placeholder: "./backend.did",
    validate: (value) => {
      if (!value) return "DID file path is required"
      const fullPath = path.resolve(projectRoot, value)
      if (!fs.existsSync(fullPath)) {
        return `File not found: ${value}`
      }
      return undefined
    },
  })

  if (p.isCancel(didFile)) return null

  return {
    name: name as string,
    config: {
      didFile: didFile as string,
      useDisplayReactor: true,
    },
  }
}
