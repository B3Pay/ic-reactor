#!/usr/bin/env node
/**
 * @ic-reactor/cli
 *
 * CLI tool to generate type-safe React hooks for ICP canisters.
 */

import { Command } from "commander"
import { initCommand } from "./commands/init.js"
import { generateCommand } from "./commands/generate.js"
import { createStartCommand } from "./commands/create.js"
import pc from "picocolors"
import { version } from "../package.json"

const program = new Command()

program
  .name("ic-reactor")
  .description(pc.cyan("🔧 Generate type-safe React hooks for ICP canisters"))
  .version(version)

program
  .command("init")
  .description("Initialize ic-reactor configuration in your project")
  .option("-y, --yes", "Skip prompts and use defaults")
  .option("-o, --out-dir <path>", "Output directory for generated files")
  .action(initCommand)

program
  .command("generate")
  .alias("g")
  .description("Generate canister declarations and hooks from .did files")
  .option("-c, --canister <name>", "Generate for a specific canister only")
  .option("--clean", "Clean output directory before generating")
  .option(
    "--bindgen-only",
    "Generate only .did, .did.d.ts, and .js declarations"
  )
  .action(generateCommand)

// `create start` — alias for `pnpm create ic-reactor-start`. Scaffolds a V0
// fully on-chain ICP React app (CSR/static). See @ic-reactor/start.
const create = program
  .command("create")
  .description("Scaffold a new project from an IC Reactor template")

create
  .command("start <app-name> [target-dir]")
  .description(
    "Scaffold a fully on-chain ICP React app (React + TanStack Router + IC Reactor + icp-cli)"
  )
  .option("--force", "Write into a non-empty target directory")
  .action(
    (
      appName: string,
      targetDir: string | undefined,
      opts: { force?: boolean }
    ) => createStartCommand(appName, targetDir, opts)
  )

program.parse()
