/**
 * Sync command
 *
 * Regenerate hooks when DID files change.
 */

import * as p from "@clack/prompts"
import fs from "node:fs"
import path from "node:path"
import pc from "picocolors"
import { loadConfig, getProjectRoot, findConfigFile } from "../utils/config.js"
import { generateReactorFile } from "../generators/index.js"
import { generateDeclarations } from "@ic-reactor/codegen"

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
    canistersToSync = canisterNames
  }

  const spinner = p.spinner()
  spinner.start("Syncing hooks...")

  let totalUpdated = 0
  const errors: string[] = []

  for (const canisterName of canistersToSync) {
    const canisterConfig = config.canisters[canisterName]

    // Regenerate declarations if missing
    const canisterOutDir = path.join(projectRoot, config.outDir, canisterName)
    const didFilePath = path.resolve(projectRoot, canisterConfig.didFile)

    spinner.message(`Regenerating declarations for ${canisterName}...`)

    try {
      const bindgenResult = await generateDeclarations({
        didFile: didFilePath,
        outDir: canisterOutDir,
        canisterName,
      })

      if (!bindgenResult.success) {
        errors.push(`${canisterName}: ${bindgenResult.error}`)
        p.log.warn(
          `Could not regenerate declarations for ${canisterName}: ${bindgenResult.error}`
        )
        continue
      }

      // Regenerate reactor.ts
      const reactorPath = path.join(canisterOutDir, "reactor.ts")

      const reactorContent = generateReactorFile({
        canisterName,
        canisterConfig,
        config,
      })
      fs.writeFileSync(reactorPath, reactorContent)
      totalUpdated++
    } catch (error) {
      errors.push(`${canisterName}: ${(error as Error).message}`)
      p.log.error(`Failed to sync ${canisterName}: ${(error as Error).message}`)
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
  p.note(`Updated: ${pc.green(totalUpdated.toString())} canisters`, "Summary")

  p.outro(pc.green("✓ Sync complete!"))
}
