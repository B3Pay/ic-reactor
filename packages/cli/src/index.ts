#!/usr/bin/env node
/**
 * @ic-reactor/cli
 *
 * CLI tool to generate type-safe React hooks for ICP canisters.
 */

import { Command } from "commander"
import { initCommand } from "./commands/init.js"
import { generateCommand } from "./commands/generate.js"
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
  .description("Generate hooks from .did files")
  .option("-c, --canister <name>", "Generate for a specific canister only")
  .option("--clean", "Clean output directory before generating")
  .action(generateCommand)

program.parse()
