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
import { realpathAllowingMissing } from "../utils/paths.js"
import {
  assertContainedPath,
  assertSafeCanisterName,
  CodegenConfigError,
  resolveContainedOutDir,
  runCanisterPipeline,
} from "@ic-reactor/codegen"
import type {
  CanisterConfig,
  CodegenConfig,
  GenerateOptions,
} from "../types.js"

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
  let canistersToProcess: string[]

  if (options.canister) {
    // An own key only. A lookup by index also finds what every object
    // inherits, so `--canister toString` ran the pipeline on
    // Object.prototype.toString and failed with a TypeError about a path.
    if (!Object.hasOwn(config.canisters, options.canister)) {
      throw new CliError(
        `Canister ${pc.yellow(options.canister)} not found in config.`
      )
    }
    canistersToProcess = [options.canister]
  } else {
    canistersToProcess = canisterNames
  }

  // Deliberately skipped for `--canister <name>`. cleanStaleOutput decides what
  // is stale by comparing the directories on disk against the FULL configured
  // set, and a single-canister run says nothing about whether the others are
  // current. The README and the docs page both promise this skip; until this
  // guard existed they described a safety property the code did not have.
  if (options.clean && options.canister) {
    p.log.warn(
      "--clean was ignored: it needs the full canister set to tell stale output " +
        "from another canister's current output. Re-run without --canister to clean."
    )
  }

  if (options.clean && !options.canister) {
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

    // The check covers every configured canister, including ones this run
    // skips, so a `--canister <name>` run cannot overwrite another entry's
    // output. It runs again before each canister because an earlier canister
    // in this run can create the directory that a later entry reaches through
    // a symlink or a path written in a different case.
    const firstUser = findSharedOutDirs(config, projectRoot).get(name)
    if (firstUser !== undefined) {
      errorCount++
      errorMessages.push(
        `${name}: generates into the same output directory as canister ` +
          `"${firstUser}". Each run replaces that directory's declarations and ` +
          `index.generated.ts, so the two would overwrite each other. Give each ` +
          `canister its own "outDir", or its own "name" if it uses the global outDir.`
      )
      continue
    }

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

/**
 * Find config entries that generate into a directory an earlier entry already
 * uses. The result maps each such key to the key of the earlier entry.
 *
 * The pipeline's `.ic-reactor-owner` marker stops a second canister from
 * generating over the first one, but it records the canister name. Two entries
 * with the same `name` both resolve to `<outDir>/<name>` and pass that check.
 * Copying an entry and changing only its key produces that config, and the
 * later entry then replaced the earlier one's output on every run.
 *
 * The check compares directories by where they really are on disk, so a symlink
 * to another entry's directory, or a spelling of it that differs only in case,
 * counts as the same directory.
 */
function findSharedOutDirs(
  config: CodegenConfig,
  projectRoot: string
): Map<string, string> {
  const firstByOutDir = new Map<string, string>()
  const shared = new Map<string, string>()

  for (const [key, canisterConfig] of Object.entries(config.canisters)) {
    const outDir = resolveOutDir(canisterConfig, config.outDir, projectRoot)
    // The pipeline rejects this canister's output fields and reports why.
    if (outDir === undefined) continue

    const realOutDir = realpathAllowingMissing(outDir)
    const first = firstByOutDir.get(realOutDir)
    if (first === undefined) {
      firstByOutDir.set(realOutDir, key)
    } else {
      shared.set(key, first)
    }
  }

  return shared
}

/**
 * The directory the pipeline generates a canister into, or `undefined` when the
 * pipeline rejects the fields that decide it.
 *
 * Only `name`, the canister's own `outDir`, the global `outDir` and the project
 * root decide the directory, so this reads nothing else and applies the checks
 * `assertSafeCanisterConfig` runs on those fields. An error in another field,
 * such as a URL in `clientManagerPath`, fails that canister's own run. Its
 * earlier output still sits in the directory, so the error must not hide the
 * directory from the overlap check.
 */
function resolveOutDir(
  canisterConfig: CanisterConfig,
  globalOutDir: string,
  projectRoot: string
): string | undefined {
  const { name } = canisterConfig

  try {
    assertSafeCanisterName(name)

    const outDir =
      canisterConfig.outDir != null
        ? resolveContainedOutDir("outDir", canisterConfig.outDir, projectRoot)
        : path.join(
            resolveContainedOutDir("outDir", globalOutDir, projectRoot),
            name
          )

    assertContainedPath("output directory", outDir, projectRoot)
    return outDir
  } catch (error) {
    if (error instanceof CodegenConfigError) return undefined
    throw error
  }
}
