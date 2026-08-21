/**
 * Generate Command
 *
 * Runs the codegen pipeline for configured canisters.
 */

import * as p from "@clack/prompts"
import path from "node:path"
import pc from "picocolors"
import {
  loadConfig,
  findConfigFile,
  CONFIG_FILE_NAME,
} from "../utils/config.js"
import { cleanStaleOutput } from "../utils/clean.js"
import { CliError, errorMessage } from "../utils/errors.js"
import { CodegenConfigError, runCanisterPipeline } from "@ic-reactor/codegen"
import type { GenerateOptions } from "../types.js"

export async function generateCommand(options: GenerateOptions) {
  console.log()
  const generationLabel = options.bindgenOnly ? "Bindgen" : "Hooks"
  const generationSummary = options.bindgenOnly ? "bindgen files" : "hooks"
  p.intro(pc.cyan(`🔄 Generate ${generationLabel}`))

  // Load config
  const configPath = findConfigFile()
  if (!configPath) {
    throw new CliError(
      `No ${CONFIG_FILE_NAME} found. Run ${pc.cyan("npx ic-reactor init")} first.`
    )
  }

  // `loadConfig` throws a CliError naming the file and the offending field, so a
  // malformed config is reported rather than crashing somewhere downstream.
  const config = loadConfig(configPath)
  if (!config) {
    throw new CliError(`Failed to load config from ${pc.yellow(configPath)}`)
  }

  // The project root is the directory the config was found in — the same
  // directory every relative path in that config is written against.
  const projectRoot = path.dirname(configPath)
  const canisterNames = Object.keys(config.canisters)

  if (canisterNames.length === 0) {
    throw new CliError("No canisters configured.")
  }

  // Determine which canisters to process
  let canistersToProcess: string[] = []

  if (options.canister) {
    if (!config.canisters[options.canister]) {
      throw new CliError(
        `Canister ${pc.yellow(options.canister)} not found in config.`
      )
    }
    canistersToProcess = [options.canister]
  } else {
    canistersToProcess = canisterNames
  }

  if (options.clean) {
    try {
      const removed = cleanStaleOutput({ config, projectRoot })
      for (const dir of removed) {
        p.log.info(
          `Removed stale output ${pc.yellow(path.relative(projectRoot, dir))}`
        )
      }
      if (removed.length === 0) {
        p.log.info("No stale generated output to remove.")
      }
    } catch (error) {
      // A config whose `outDir` escapes the project root. Refuse the whole run:
      // the same value is about to be handed to the pipeline anyway.
      if (error instanceof CodegenConfigError) throw new CliError(error.message)
      throw error
    }
  }

  const spinner = p.spinner()
  spinner.start(
    `Generating ${generationSummary} for ${canistersToProcess.length} canisters...`
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
        generateReactor: !options.bindgenOnly,
      })

      if (result.success) {
        successCount++
      } else {
        errorCount++
        errorMessages.push(`${name}: ${result.error}`)
      }
    } catch (err) {
      errorCount++
      errorMessages.push(`${name}: ${errorMessage(err)}`)
    }
  }

  spinner.stop(`${generationLabel} generation complete`)

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
    // The per-canister errors are already printed above; this is the exit code.
    throw new CliError(`${generationLabel} generation failed with errors.`)
  }

  p.outro(pc.green(`✓ All ${generationSummary} generated successfully!`))
}
