/**
 * Generate Command
 *
 * Runs the codegen pipeline for configured canisters.
 */

import * as p from "@clack/prompts"
import pc from "picocolors"
import { loadConfig, findConfigFile, getProjectRoot } from "../utils/config.js"
import { runCanisterPipeline } from "@ic-reactor/codegen"
import type { GenerateOptions } from "../types.js"

export async function generateCommand(options: GenerateOptions) {
  console.log()
  p.intro(pc.cyan("🔄 Generate Hooks"))

  // Load config
  const configPath = findConfigFile()
  if (!configPath) {
    p.log.error(
      `No ${pc.yellow("ic-reactor.json")} found. Run ${pc.cyan("npx ic-reactor init")} first.`
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

  // Determine which canisters to process
  let canistersToProcess: string[] = []

  if (options.canister) {
    if (!config.canisters[options.canister]) {
      p.log.error(
        `Canister ${pc.yellow(options.canister)} not found in config.`
      )
      process.exit(1)
    }
    canistersToProcess = [options.canister]
  } else {
    canistersToProcess = canisterNames
  }

  const spinner = p.spinner()
  spinner.start(
    `Generating hooks for ${canistersToProcess.length} canisters...`
  )

  let successCount = 0
  let errorCount = 0
  const errorMessages: string[] = []

  // Run pipeline for each canister
  for (const name of canistersToProcess) {
    const canisterConfig = config.canisters[name]

    spinner.message(`Processing ${pc.cyan(name)}...`)

    try {
      const result = await runCanisterPipeline({
        canisterConfig,
        projectRoot,
        globalConfig: config,
      })

      if (result.success) {
        successCount++
      } else {
        errorCount++
        errorMessages.push(`${name}: ${result.error}`)
      }
    } catch (err) {
      errorCount++
      errorMessages.push(
        `${name}: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  spinner.stop("Generation complete")

  if (errorMessages.length > 0) {
    console.log()
    p.log.error("Errors encountered:")
    for (const msg of errorMessages) {
      console.log(`  ${pc.red("•")} ${msg}`)
    }
  }

  console.log()
  p.note(
    `Success: ${pc.green(successCount.toString())}\n` +
      `Failed:  ${pc.red(errorCount.toString())}`,
    "Summary"
  )

  if (errorCount > 0) {
    p.outro(pc.red("✖ Generation failed with errors."))
    process.exit(1)
  } else {
    p.outro(pc.green("✓ All hooks generated successfully!"))
  }
}
