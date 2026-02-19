/**
 * Init Command
 *
 * Initializes ic-reactor.json configuration.
 */

import * as p from "@clack/prompts"
import fs from "node:fs"
import path from "node:path"
import pc from "picocolors"
import {
  CONFIG_FILE_NAME,
  DEFAULT_CONFIG,
  findConfigFile,
  saveConfig,
  getProjectRoot,
  ensureDir,
} from "../utils/config.js"
import type { CodegenConfig, CanisterConfig } from "../types.js"
import { generateClientFile } from "@ic-reactor/codegen"

interface InitOptions {
  yes?: boolean
  outDir?: string
}

export async function initCommand(options: InitOptions) {
  console.log()
  p.intro(pc.cyan("🔧 ic-reactor CLI Setup"))

  // Check if config already exists
  const existingConfig = findConfigFile()
  if (existingConfig) {
    const shouldOverwrite = await p.confirm({
      message: `Config file already exists at ${pc.yellow(existingConfig)}. Overwrite?`,
      initialValue: false,
    })

    if (p.isCancel(shouldOverwrite) || !shouldOverwrite) {
      p.cancel("Setup cancelled.")
      process.exit(0)
    }
  }

  const projectRoot = getProjectRoot()
  let config: CodegenConfig

  if (options.yes) {
    config = { ...DEFAULT_CONFIG }
    if (options.outDir) {
      config.outDir = options.outDir
    }
  } else {
    // Interactive Setup

    // Output Directory
    const outDir = await p.text({
      message: "Where should generated files be placed?",
      placeholder: "src/declarations",
      defaultValue: "src/declarations",
    })
    if (p.isCancel(outDir)) process.exit(0)

    // Client Manager Path
    const clientManagerPath = await p.text({
      message: "Relative path for the client manager import?",
      placeholder: "../../clients",
      defaultValue: "../../clients",
    })
    if (p.isCancel(clientManagerPath)) process.exit(0)

    config = {
      ...DEFAULT_CONFIG,
      outDir: outDir as string,
      clientManagerPath: clientManagerPath as string,
    }

    // Add initial canister?
    const addCanister = await p.confirm({
      message: "Would you like to configure a canister now?",
      initialValue: true,
    })
    if (p.isCancel(addCanister)) process.exit(0)

    if (addCanister) {
      const canister = await promptForCanister(projectRoot)
      if (canister) {
        config.canisters[canister.name] = canister
      }
    }
  }

  // Save config
  const configPath = path.join(projectRoot, CONFIG_FILE_NAME)
  saveConfig(config, configPath)

  // Ensure directories exist
  ensureDir(path.join(projectRoot, config.outDir))

  // Create default Client Manager
  const clientManagerFile = path.join(projectRoot, "src/clients.ts")
  // Simple heuristic: if clientManagerPath is "../../clients", likely file is src/clients.ts
  // Users can move it, but this gives a good start.

  if (!fs.existsSync(clientManagerFile)) {
    const createHelpers = await p.confirm({
      message: `Create a default client manager at ${pc.green("src/clients.ts")}?`,
      initialValue: true,
    })

    if (createHelpers === true) {
      ensureDir(path.dirname(clientManagerFile))
      fs.writeFileSync(clientManagerFile, generateClientFile())
      p.log.success(`Created ${pc.green("src/clients.ts")}`)
    }
  }

  p.log.success(`Created ${pc.green(CONFIG_FILE_NAME)}`)

  console.log()
  p.note(
    `To generate hooks, run:\n${pc.cyan("npx ic-reactor generate")}`,
    "Next Steps"
  )

  p.outro(pc.green("✓ Setup complete!"))
}

async function promptForCanister(
  projectRoot: string
): Promise<CanisterConfig | null> {
  const name = await p.text({
    message: "Canister name",
    placeholder: "backend",
    validate: (val) => {
      if (!val) return "Name is required"
      if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(val)) return "Invalid name format"
    },
  })
  if (p.isCancel(name)) return null

  const didFile = await p.text({
    message: "Path to .did file",
    placeholder: "./src/backend/backend.did",
    validate: (val) => {
      if (!val) return "Path is required"
      const fullPath = path.resolve(projectRoot, val)
      if (!fs.existsSync(fullPath)) return `File not found: ${val}`
    },
  })
  if (p.isCancel(didFile)) return null

  return {
    name: name as string,
    didFile: didFile as string,
  }
}
