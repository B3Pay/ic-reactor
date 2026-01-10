/**
 * Sync command
 *
 * Regenerate hooks when DID files change.
 */

import * as p from "@clack/prompts"
import fs from "node:fs"
import path from "node:path"
import pc from "picocolors"
import {
  loadConfig,
  getProjectRoot,
  findConfigFile,
  ensureDir,
} from "../utils/config.js"
import { parseDIDFile } from "../parsers/did.js"
import {
  generateReactorFile,
  generateQueryHook,
  generateMutationHook,
} from "../generators/index.js"
import { getHookFileName } from "../utils/naming.js"
import { generateDeclarations } from "../utils/bindgen.js"
import type { MethodInfo } from "../types.js"

interface SyncOptions {
  canister?: string
}

export async function syncCommand(options: SyncOptions) {
  console.log()
  p.intro(pc.cyan("🔄 Sync Canister Hooks"))

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

  if (canisterNames.length === 0) {
    p.log.error("No canisters configured.")
    process.exit(1)
  }

  // Select canisters to sync
  let canistersToSync: string[]

  if (options.canister) {
    if (!config.canisters[options.canister]) {
      p.log.error(
        `Canister ${pc.yellow(options.canister)} not found in config.`
      )
      process.exit(1)
    }
    canistersToSync = [options.canister]
  } else {
    // Sync all canisters with generated hooks
    canistersToSync = canisterNames.filter(
      (name) => (config.generatedHooks[name]?.length ?? 0) > 0
    )

    if (canistersToSync.length === 0) {
      p.log.warn("No hooks have been generated yet. Run `add` first.")
      process.exit(0)
    }
  }

  const spinner = p.spinner()
  spinner.start("Syncing hooks...")

  let totalUpdated = 0
  let totalSkipped = 0
  const errors: string[] = []

  for (const canisterName of canistersToSync) {
    const canisterConfig = config.canisters[canisterName]
    const generatedMethods = config.generatedHooks[canisterName] ?? []

    if (generatedMethods.length === 0) {
      continue
    }

    // Parse DID file
    const didFilePath = path.resolve(projectRoot, canisterConfig.didFile)
    let methods: MethodInfo[]

    try {
      methods = parseDIDFile(didFilePath)
    } catch (error) {
      errors.push(
        `${canisterName}: Failed to parse DID file - ${(error as Error).message}`
      )
      continue
    }

    // Check for removed methods
    const currentMethodNames = methods.map((m) => m.name)
    const removedMethods = generatedMethods.filter(
      (name) => !currentMethodNames.includes(name)
    )

    if (removedMethods.length > 0) {
      p.log.warn(
        `${canisterName}: Methods removed from DID: ${pc.yellow(removedMethods.join(", "))}`
      )
    }

    // Check for new methods
    const newMethods = methods.filter((m) => !generatedMethods.includes(m.name))

    if (newMethods.length > 0) {
      p.log.info(
        `${canisterName}: New methods available: ${pc.cyan(newMethods.map((m) => m.name).join(", "))}`
      )
    }

    // Regenerate declarations if missing
    const canisterOutDir = path.join(projectRoot, config.outDir, canisterName)
    const declarationsDir = path.join(canisterOutDir, "declarations")

    // Check if declarations exist and have files (not just nested empty dir)
    const declarationsExist =
      fs.existsSync(declarationsDir) &&
      fs
        .readdirSync(declarationsDir)
        .some((f) => f.endsWith(".ts") || f.endsWith(".js"))

    if (!declarationsExist) {
      spinner.message(`Regenerating declarations for ${canisterName}...`)
      const bindgenResult = await generateDeclarations({
        didFile: didFilePath,
        outDir: canisterOutDir,
        canisterName,
      })

      if (bindgenResult.success) {
        totalUpdated++
      } else {
        p.log.warn(
          `Could not regenerate declarations for ${canisterName}: ${bindgenResult.error}`
        )
      }
    }

    // Regenerate reactor.ts
    const reactorPath = path.join(canisterOutDir, "reactor.ts")

    const reactorContent = generateReactorFile({
      canisterName,
      canisterConfig,
      config,
      outDir: canisterOutDir,
    })
    fs.writeFileSync(reactorPath, reactorContent)
    totalUpdated++

    // Regenerate existing hooks
    const hooksOutDir = path.join(canisterOutDir, "hooks")
    ensureDir(hooksOutDir)

    for (const methodName of generatedMethods) {
      const method = methods.find((m) => m.name === methodName)

      if (!method) {
        // Method was removed, skip but warn
        totalSkipped++
        continue
      }

      // Determine hook type from existing file
      const queryFileName = getHookFileName(methodName, "query")
      const mutationFileName = getHookFileName(methodName, "mutation")
      const infiniteQueryFileName = getHookFileName(methodName, "infiniteQuery")

      let content: string
      let fileName: string

      if (fs.existsSync(path.join(hooksOutDir, infiniteQueryFileName))) {
        // Keep as infinite query (user configured this)
        fileName = infiniteQueryFileName
        // Skip regeneration to preserve user customizations
        totalSkipped++
        continue
      } else if (method.type === "query") {
        fileName = queryFileName
        content = generateQueryHook({
          canisterName,
          method,
          config,
        })
      } else {
        fileName = mutationFileName
        content = generateMutationHook({
          canisterName,
          method,
          config,
        })
      }

      fs.writeFileSync(path.join(hooksOutDir, fileName), content)
      totalUpdated++
    }
  }

  spinner.stop("Sync complete!")

  // Display results
  if (errors.length > 0) {
    console.log()
    p.log.error("Errors encountered:")
    for (const error of errors) {
      console.log(`  ${pc.red("•")} ${error}`)
    }
  }

  console.log()
  p.note(
    `Updated: ${pc.green(totalUpdated.toString())} files\n` +
      `Skipped: ${pc.dim(totalSkipped.toString())} files (preserved customizations)`,
    "Summary"
  )

  p.outro(pc.green("✓ Sync complete!"))
}
