/**
 * Init command
 *
 * Initializes ic-reactor configuration in the project.
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
import type { ReactorConfig, CanisterConfig } from "../types.js"

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
  let config: ReactorConfig

  if (options.yes) {
    // Use defaults
    config = { ...DEFAULT_CONFIG }
    if (options.outDir) {
      config.outDir = options.outDir
    }
  } else {
    // Interactive mode
    const outDir = await p.text({
      message: "Where should generated hooks be placed?",
      placeholder: "src/canisters",
      defaultValue: "src/canisters",
      validate: (value) => {
        if (!value) return "Output directory is required"
        return undefined
      },
    })

    if (p.isCancel(outDir)) {
      p.cancel("Setup cancelled.")
      process.exit(0)
    }

    // Ask if they want to add a canister now
    const addCanister = await p.confirm({
      message: "Would you like to add a canister now?",
      initialValue: true,
    })

    if (p.isCancel(addCanister)) {
      p.cancel("Setup cancelled.")
      process.exit(0)
    }

    config = {
      ...DEFAULT_CONFIG,
      outDir: outDir as string,
    }

    if (addCanister) {
      const canisterInfo = await promptForCanister(projectRoot)
      if (canisterInfo) {
        config.canisters[canisterInfo.name] = canisterInfo.config
      }
    }
  }

  // Save config file
  const configPath = path.join(projectRoot, CONFIG_FILE_NAME)
  saveConfig(config, configPath)

  // Create output directory
  const fullOutDir = path.join(projectRoot, config.outDir)
  ensureDir(fullOutDir)

  // Create a sample client manager if it doesn't exist
  const clientManagerPath = path.join(projectRoot, "src/lib/client.ts")
  if (!fs.existsSync(clientManagerPath)) {
    const createClient = await p.confirm({
      message: "Create a sample client manager at src/lib/client.ts?",
      initialValue: true,
    })

    if (!p.isCancel(createClient) && createClient) {
      ensureDir(path.dirname(clientManagerPath))
      fs.writeFileSync(clientManagerPath, getClientManagerTemplate())
      p.log.success(`Created ${pc.green("src/lib/client.ts")}`)
    }
  }

  p.log.success(`Created ${pc.green(CONFIG_FILE_NAME)}`)
  p.log.success(`Created ${pc.green(config.outDir)} directory`)

  console.log()
  p.note(
    `Next steps:
  
  1. ${pc.cyan("Add a canister:")}
     ${pc.dim("npx @ic-reactor/cli add")}
  
  2. ${pc.cyan("List available methods:")}
     ${pc.dim("npx @ic-reactor/cli list -c <canister-name>")}
  
  3. ${pc.cyan("Add hooks for specific methods:")}
     ${pc.dim("npx @ic-reactor/cli add -c <canister> -m <method>")}`,
    "Getting Started"
  )

  p.outro(pc.green("✓ ic-reactor initialized successfully!"))
}

async function promptForCanister(
  projectRoot: string
): Promise<{ name: string; config: CanisterConfig } | null> {
  const name = await p.text({
    message: "Canister name",
    placeholder: "backend",
    validate: (value) => {
      if (!value) return "Canister name is required"
      if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(value)) {
        return "Canister name must start with a letter and contain only letters, numbers, hyphens, and underscores"
      }
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

  const clientManagerPath = await p.text({
    message:
      "Import path to your client manager (relative from generated hooks)",
    placeholder: "../../lib/client",
    defaultValue: "../../lib/client",
  })

  if (p.isCancel(clientManagerPath)) return null

  const useDisplayReactor = await p.confirm({
    message:
      "Use DisplayReactor? (auto-converts bigint → string, Principal → string)",
    initialValue: true,
  })

  if (p.isCancel(useDisplayReactor)) return null

  return {
    name: name as string,
    config: {
      didFile: didFile as string,
      clientManagerPath: clientManagerPath as string,
      useDisplayReactor: useDisplayReactor as boolean,
    },
  }
}

function getClientManagerTemplate(): string {
  return `/**
 * IC Client Manager
 *
 * This file configures the IC agent and client manager for your application.
 * Customize the agent options based on your environment.
 */

import { ClientManager } from "@ic-reactor/react"

/**
 * The client manager handles agent lifecycle and authentication.
 *
 * Configuration options:
 * - host: IC network host (defaults to process env or mainnet)
 * - identity: Initial identity (optional, can be set later)
 * - verifyQuerySignatures: Verify query signatures (recommended for production)
 *
 * For local development, the agent will automatically detect local replica.
 */
export const clientManager = new ClientManager({
  // Uncomment for explicit host configuration:
  // host: process.env.DFX_NETWORK === "local"
  //   ? "http://localhost:4943"
  //   : "https://icp-api.io",
})
`
}
