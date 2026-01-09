/**
 * List command
 *
 * List available methods from a canister's DID file.
 */

import * as p from "@clack/prompts"
import path from "node:path"
import pc from "picocolors"
import { loadConfig, getProjectRoot, findConfigFile } from "../utils/config.js"
import { parseDIDFile } from "../parsers/did.js"

interface ListOptions {
  canister?: string
}

export async function listCommand(options: ListOptions) {
  console.log()
  p.intro(pc.cyan("📋 List Canister Methods"))

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
    p.log.error(
      `No canisters configured. Add a canister to ${pc.yellow("reactor.config.json")} first.`
    )
    process.exit(1)
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

  try {
    const methods = parseDIDFile(didFilePath)

    if (methods.length === 0) {
      p.log.warn(`No methods found in ${pc.yellow(didFilePath)}`)
      process.exit(0)
    }

    const queries = methods.filter((m) => m.type === "query")
    const mutations = methods.filter((m) => m.type === "mutation")
    const generatedMethods = config.generatedHooks[selectedCanister] ?? []

    // Display queries
    if (queries.length > 0) {
      console.log()
      console.log(pc.bold(pc.cyan("  Queries:")))
      for (const method of queries) {
        const isGenerated = generatedMethods.includes(method.name)
        const status = isGenerated ? pc.green("✓") : pc.dim("○")
        const argsHint = method.hasArgs ? pc.dim("(args)") : pc.dim("()")
        console.log(`    ${status} ${method.name} ${argsHint}`)
      }
    }

    // Display mutations
    if (mutations.length > 0) {
      console.log()
      console.log(pc.bold(pc.yellow("  Mutations (Updates):")))
      for (const method of mutations) {
        const isGenerated = generatedMethods.includes(method.name)
        const status = isGenerated ? pc.green("✓") : pc.dim("○")
        const argsHint = method.hasArgs ? pc.dim("(args)") : pc.dim("()")
        console.log(`    ${status} ${method.name} ${argsHint}`)
      }
    }

    // Summary
    console.log()
    const generatedCount = generatedMethods.length
    const totalCount = methods.length

    p.note(
      `Total: ${pc.bold(totalCount.toString())} methods\n` +
        `Generated: ${pc.green(generatedCount.toString())} / ${totalCount}\n\n` +
        `${pc.green("✓")} = hook generated\n` +
        `${pc.dim("○")} = not yet generated`,
      selectedCanister
    )

    if (generatedCount < totalCount) {
      console.log()
      console.log(
        pc.dim(
          `  Run ${pc.cyan(`npx @ic-reactor/cli add -c ${selectedCanister}`)} to add hooks`
        )
      )
    }
  } catch (error) {
    p.log.error(
      `Failed to parse DID file: ${pc.yellow(didFilePath)}\n${(error as Error).message}`
    )
    process.exit(1)
  }

  console.log()
}
