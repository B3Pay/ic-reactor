/**
 * Command wiring and the top-level error boundary.
 *
 * Kept apart from `index.ts` so the program can be built and run without the
 * shebang module's side effects — the tests drive `runCli` directly.
 */

import { Command } from "commander"
import * as p from "@clack/prompts"
import pc from "picocolors"
import { initCommand } from "./commands/init.js"
import { generateCommand } from "./commands/generate.js"
import { CliError } from "./utils/errors.js"
import { version } from "../package.json"

export function buildProgram(): Command {
  const program = new Command()

  program
    .name("ic-reactor")
    .description(pc.cyan("🔧 Generate type-safe React hooks for ICP canisters"))
    .version(version)

  program
    .command("init")
    .description("Initialize ic-reactor configuration in the current directory")
    .option("-y, --yes", "Skip prompts and use defaults")
    .option("-o, --out-dir <path>", "Output directory for generated files")
    .action(initCommand)

  program
    .command("generate")
    .alias("g")
    .description("Generate canister declarations and hooks from .did files")
    .option("-c, --canister <name>", "Generate for a specific canister only")
    .option(
      "--clean",
      "Remove generated output for canisters that are no longer configured"
    )
    .option(
      "--bindgen-only",
      "Generate only .did, .did.d.ts, and .js declarations"
    )
    .action(generateCommand)

  return program
}

/**
 * Parse and run, returning the process exit code.
 *
 * Every action is async, so `program.parse()` returned before any of them
 * settled and a rejection surfaced as an unhandled rejection: a raw stack into
 * bundled dist code, with the exit code decided by the Node runtime rather than
 * by us. `parseAsync` plus this catch is what turns a failure into one formatted
 * line and a deliberate exit 1.
 */
export async function runCli(argv?: string[]): Promise<number> {
  try {
    const program = buildProgram()
    if (argv) {
      await program.parseAsync(argv, { from: "user" })
    } else {
      await program.parseAsync()
    }
    return 0
  } catch (error) {
    reportError(error)
    return 1
  }
}

function reportError(error: unknown): void {
  if (error instanceof CliError) {
    p.log.error(error.message)
    p.outro(pc.red("✖ Command failed."))
    return
  }

  // Not a failure the user was told about in words — keep the stack, it is the
  // only clue an unexpected crash leaves behind.
  p.log.error(
    error instanceof Error ? (error.stack ?? error.message) : String(error)
  )
  p.outro(pc.red("✖ Unexpected error."))
}
