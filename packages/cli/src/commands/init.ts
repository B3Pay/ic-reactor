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
  createDefaultConfig,
  findConfigFile,
  saveConfig,
  ensureDir,
} from "../utils/config.js"
import { CliError } from "../utils/errors.js"
import { realpathAllowingMissing } from "../utils/paths.js"
import type { CodegenConfig, CanisterConfig, InitOptions } from "../types.js"
import {
  generateClientFile,
  assertContainedPath,
  resolveContainedOutDir,
  CodegenConfigError,
} from "@ic-reactor/codegen"

/** The client manager import codegen uses when the config sets none. */
const DEFAULT_CLIENT_MANAGER_PATH = "../../clients"

export async function initCommand(options: InitOptions) {
  console.log()
  p.intro(pc.cyan("🔧 ic-reactor CLI Setup"))

  // `init` writes to the current directory and nowhere else.
  //
  // It used to take its target from `getProjectRoot()`, which walks *up* to the
  // nearest ic-reactor.json — so running it in a monorepo package resolved to
  // the repository-root config and replaced it with defaults, wiping that
  // project's `canisters` map while creating nothing in the directory the user
  // was standing in.
  const projectRoot = process.cwd()
  const configPath = path.join(projectRoot, CONFIG_FILE_NAME)

  if (fs.existsSync(configPath)) {
    if (options.yes) {
      // `-y` means "do not ask me", not "overwrite whatever is there". A CI step
      // running `init -y && generate` against a checked-in config must not have
      // that config replaced by defaults.
      p.log.warn(
        `${pc.yellow(CONFIG_FILE_NAME)} already exists at ${configPath} — leaving it as it is.\n` +
          `Delete it, or run ${pc.cyan("ic-reactor init")} without ${pc.cyan("-y")}, to reconfigure.`
      )
      p.outro(pc.green("✓ Nothing to do."))
      return
    }

    const shouldOverwrite = await p.confirm({
      message: `Config file already exists at ${pc.yellow(configPath)}. Overwrite?`,
      initialValue: false,
    })

    if (p.isCancel(shouldOverwrite) || !shouldOverwrite) {
      p.cancel("Setup cancelled.")
      return
    }
  } else {
    // A config in a parent directory is a different project. Say so, because the
    // generated files land here and `generate` run from here will now find this
    // config rather than that one.
    const ancestorConfig = findConfigFile(path.dirname(projectRoot))
    if (ancestorConfig) {
      p.log.warn(
        `An ${pc.yellow(CONFIG_FILE_NAME)} already exists in a parent directory:\n` +
          `${ancestorConfig}\n` +
          `It is left untouched — this creates a separate config in ${projectRoot}.`
      )
    }
  }

  const config = await buildConfig(options, projectRoot)
  if (!config) {
    // A cancelled prompt. Nothing has been written yet, and nothing will be:
    // Ctrl+C part-way through the canister questions used to fall through to
    // `saveConfig` and leave a half-answered config behind.
    p.cancel("Setup cancelled.")
    return
  }

  // Resolve and containment-check every path BEFORE anything is written. Both
  // values come from `--out-dir` or a free-text prompt, and both are turned into
  // directories we create; validating after `saveConfig` meant a rejected path
  // still left a written — or overwritten — config on disk.
  let resolvedOutDir: string
  let clientManagerFile: string
  try {
    resolvedOutDir = resolveContainedOutDir(
      "outDir",
      config.outDir,
      projectRoot
    )
    clientManagerFile = resolveClientManagerFilePath(
      projectRoot,
      resolvedOutDir,
      config
    )
  } catch (err) {
    if (err instanceof CodegenConfigError) {
      throw new CliError(err.message)
    }
    throw err
  }

  // `generate` imports the helper through `clientManagerPath`, and a config
  // that sets none imports "../../clients" from `<outDir>/<canister>/`. With no
  // canister configured the helper goes to src/clients.ts, which that default
  // reaches only when outDir sits directly inside src/. For any other outDir,
  // record the import that does reach it, or the first `generate` emits one tsc
  // cannot resolve.
  if (config.clientManagerPath === undefined) {
    const importPath = clientManagerImportPath(
      resolvedOutDir,
      clientManagerFile
    )
    if (importPath !== DEFAULT_CLIENT_MANAGER_PATH) {
      config.clientManagerPath = importPath
    }
  }

  // Everything below this line writes to disk.
  saveConfig(config, configPath)

  // Ensure directories exist
  ensureDir(resolvedOutDir)

  if (!fs.existsSync(clientManagerFile)) {
    const displayedPath = path.relative(projectRoot, clientManagerFile)

    let createHelpers: boolean
    if (options.yes) {
      createHelpers = true
    } else {
      const answer = await p.confirm({
        message: `Create a default client manager at ${pc.green(displayedPath)}?`,
        initialValue: true,
      })
      createHelpers = answer === true
    }

    if (createHelpers) {
      ensureDir(path.dirname(clientManagerFile))
      fs.writeFileSync(clientManagerFile, generateClientFile())
      p.log.success(`Created ${pc.green(displayedPath)}`)
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

/**
 * Assemble the config, either from defaults or from the interactive questions.
 *
 * @returns the config, or `null` if the user cancelled a prompt.
 */
async function buildConfig(
  options: InitOptions,
  projectRoot: string
): Promise<CodegenConfig | null> {
  const config = createDefaultConfig()

  if (options.yes) {
    if (options.outDir) {
      config.outDir = options.outDir
    }
    return config
  }

  // Interactive Setup

  // Output Directory
  const outDir = await p.text({
    message: "Where should generated files be placed?",
    placeholder: "src/declarations",
    defaultValue: "src/declarations",
  })
  if (p.isCancel(outDir)) return null

  // Client Manager Path
  const clientManagerPath = await p.text({
    message: "Relative path for the client manager import?",
    placeholder: "../../clients",
    defaultValue: "../../clients",
  })
  if (p.isCancel(clientManagerPath)) return null

  config.outDir = outDir
  config.clientManagerPath = clientManagerPath

  // Add initial canister?
  const addCanister = await p.confirm({
    message: "Would you like to configure a canister now?",
    initialValue: true,
  })
  if (p.isCancel(addCanister)) return null

  if (addCanister) {
    const canister = await promptForCanister(projectRoot)
    if (!canister) return null
    config.canisters[canister.name] = canister
  }

  return config
}

/**
 * @param outDir - `config.outDir` already resolved against the project root.
 * Joining the raw value onto the root turned an absolute outDir into a path
 * nested inside the project, which the pipeline never writes to.
 */
function resolveClientManagerFilePath(
  projectRoot: string,
  outDir: string,
  config: CodegenConfig
): string {
  const canisterName = Object.keys(config.canisters)[0]
  if (!canisterName) {
    return path.join(projectRoot, "src", "clients.ts")
  }

  const clientManagerPath =
    config.clientManagerPath ?? DEFAULT_CLIENT_MANAGER_PATH
  const generatedEntryDir = path.join(outDir, canisterName)
  const resolvedPath = path.resolve(generatedEntryDir, clientManagerPath)
  const filePath = path.extname(resolvedPath)
    ? resolvedPath
    : `${resolvedPath}.ts`

  // `clientManagerPath` is an import specifier in generated code, but here it is
  // also a WRITE target — init creates the file. A config-supplied value must
  // not be able to place that file outside the project.
  assertContainedPath(
    "clientManagerPath",
    filePath,
    projectRoot,
    clientManagerPath
  )

  return filePath
}

/**
 * The `clientManagerPath` that imports `file` from a generated reactor.
 *
 * `generate` writes each canister's reactor into `<outDir>/<canister>/`, one
 * directory below `outDir` whatever the canister is called, so the import is
 * ".." followed by the path from `outDir` to `file`. That path is taken between
 * real locations. Between the paths as written, an absolute outDir that reaches
 * the project through a symlink gives an import that climbs out of the real
 * directory tree, which is where tsc and bundlers resolve it from.
 */
function clientManagerImportPath(outDir: string, file: string): string {
  const withoutExtension = file.slice(
    0,
    file.length - path.extname(file).length
  )
  const fromOutDir = path.relative(
    realpathAllowingMissing(outDir),
    realpathAllowingMissing(withoutExtension)
  )
  // Import specifiers use "/" on every platform, and codegen rejects "\".
  return path.posix.join("..", ...fromOutDir.split(path.sep))
}

/**
 * @returns the canister, or `null` if the user cancelled a prompt.
 */
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
    name,
    didFile,
  }
}
