import type { Canister, Client } from "@ic-reactor/core"
import type { CanisterInterface, MethodInfo } from "../interface/types.ts"
import type { DynActor } from "../lib/reactor.ts"
import { addHistoryEntry, newHistoryId } from "./history.ts"
import type { PreparedCall } from "./prepare.ts"
import { readQueryOptions } from "./query-options.ts"
import { historyEntryOf, type CallResult } from "./record.ts"

/**
 * Reads now, never from the cache (a click asks for the canister's answer),
 * into the very key `useQuery(readQueryOptions(…))` observes, and records
 * the read in the history. Event handlers only: it reads the clock.
 */
export function readNow(
  client: Client,
  can: Canister<DynActor>,
  iface: CanisterInterface,
  method: MethodInfo,
  call: PreparedCall,
  opts?: { idempotent?: boolean }
): void {
  const caller = client.caller()
  const options = readQueryOptions(client, can, method, call.vars, opts)
  const record = (result: CallResult) =>
    addHistoryEntry(
      historyEntryOf(
        { iface, method, caller, bytes: call.bytes, result },
        Date.now(),
        newHistoryId()
      )
    )
  client.queryClient.fetchQuery({ ...options, staleTime: 0 }).then(
    (reply) => record({ ok: true, reply }),
    (error: unknown) => record({ ok: false, error })
  )
}
