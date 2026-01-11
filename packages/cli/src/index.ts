#!/usr/bin/env node
/**
 * @ic-reactor/cli
 *
 * CLI tool to generate shadcn-style React hooks for ICP canisters.
 * Gives users full control over generated code - no magic, just scaffolding.
 */

import { Command } from "commander"
import { initCommand } from "./commands/init.js"
import { addCommand } from "./commands/add.js"
import { syncCommand } from "./commands/sync.js"
import { listCommand } from "./commands/list.js"
import { fetchCommand } from "./commands/fetch.js"
import pc from "picocolors"

const program = new Command()

program
  .name("ic-reactor")
  .description(
    pc.cyan("🔧 Generate shadcn-style React hooks for ICP canisters")
  )
  .version("3.0.0")

program
  .command("init")
  .description("Initialize ic-reactor configuration in your project")
  .option("-y, --yes", "Skip prompts and use defaults")
  .option("-o, --out-dir <path>", "Output directory for generated hooks")
  .action(initCommand)

program
  .command("add")
  .description("Add hooks for canister methods (from local .did file)")
  .option("-c, --canister <name>", "Canister name to add hooks for")
  .option("-m, --methods <methods...>", "Method names to generate hooks for")
  .option("-a, --all", "Add hooks for all methods")
  .action(addCommand)

program
  .command("fetch")
  .description("Fetch Candid from a live canister and generate hooks")
  .option("-i, --canister-id <id>", "Canister ID to fetch from")
  .option("-n, --network <network>", "Network: 'ic' or 'local'", "ic")
  .option("--name <name>", "Name for the canister in generated code")
  .option("-m, --methods <methods...>", "Method names to generate hooks for")
  .option("-a, --all", "Add hooks for all methods")
  .action(fetchCommand)

program
  .command("sync")
  .description("Sync hooks with .did file changes")
  .option("-c, --canister <name>", "Canister to sync")
  .action(syncCommand)

program
  .command("list")
  .description("List available methods from a canister")
  .option("-c, --canister <name>", "Canister to list methods from")
  .action(listCommand)

program.parse()
