// What every command runs with: one client for the whole process (one per
// tab, one per request, one per run of a tool), and what the command line
// chose. src/run.ts builds it; the demo builds its own over a test client.
import type { Client } from "@ic-reactor/core"
import type { Caller } from "./identity.ts"
import type { LedgerChoice } from "./ledgers.ts"
import type { NetworkChoice } from "./network.ts"
import type { Output } from "./output.ts"

export interface Context {
  readonly client: Client
  readonly caller: Caller
  readonly network: NetworkChoice
  readonly ledger: LedgerChoice
  readonly out: Output
  /** The time now, in nanoseconds since the epoch: a transfer's `created_at_time`. */
  readonly now: () => bigint
  /** Calls `stop` on Ctrl-C (SIGINT). Returns a function that stops listening. */
  readonly onInterrupt: (stop: () => void) => () => void
}
