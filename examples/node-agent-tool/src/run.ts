// The whole CLI as one function: arguments in, exit code out. src/cli.ts
// calls it with the process; the tests call it with a client over an
// in-memory replica. Nothing here reads `process`.
//
// One run, one client: built from the command line (who calls, on which
// network) with `createClient({ network, identity })`, used by one command,
// and disposed when the command is done.
import type { Client, ClientOptions } from "@ic-reactor/core"
import { parseCommandLine, USAGE, type CommandLine } from "./command-line.ts"
import { demo } from "./commands/demo.ts"
import { execute } from "./dispatch.ts"
import { failureOf, reportFailure } from "./failure.ts"
import { callerFrom } from "./identity.ts"
import { UsageError } from "./input.ts"
import { ledgerFrom } from "./ledgers.ts"
import { networkFrom } from "./network.ts"
import { createOutput, type Io } from "./output.ts"

/** What a run needs from its surroundings. */
export interface Runtime {
  /** The arguments after `node src/cli.ts`. */
  readonly argv: readonly string[]
  readonly env: Readonly<Record<string, string | undefined>>
  readonly io: Io
  /** Builds the run's client: `createClient` in the CLI, a test client in the tests. */
  readonly connect: (options: ClientOptions) => Client
  /** The time now, in nanoseconds since the epoch. */
  readonly now: () => bigint
  readonly readFile: (path: string) => string
  /** Calls `stop` on Ctrl-C. Returns a function that stops listening. */
  readonly onInterrupt: (stop: () => void) => () => void
}

export async function run(rt: Runtime): Promise<number> {
  let line: CommandLine
  try {
    line = parseCommandLine(rt.argv)
  } catch (error) {
    const out = createOutput(rt.io, rt.argv.includes("--json"))
    const command = error instanceof UsageError ? error.command : undefined
    return reportFailure(out, command ?? null, failureOf(error))
  }
  if (line.help) {
    rt.io.stdout(USAGE)
    return 0
  }

  const out = createOutput(rt.io, line.json)
  if (line.command === "demo") return demo(out)

  let client: Client | undefined
  try {
    const caller = callerFrom(line.flags.pem, rt.env, rt.readFile)
    const network = networkFrom(line.flags.network, line.flags["root-key"])
    const ledger = ledgerFrom(line.flags.ledger)
    client = rt.connect({ network: network.network, identity: caller.identity })
    return await execute(line, {
      client,
      caller,
      network,
      ledger,
      out,
      now: rt.now,
      onInterrupt: rt.onInterrupt,
    })
  } catch (error) {
    return reportFailure(out, line.command, failureOf(error))
  } finally {
    client?.dispose()
  }
}
