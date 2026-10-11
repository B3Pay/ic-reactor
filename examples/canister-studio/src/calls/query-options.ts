// FOUNDATION: a working first version of the contract; B3 owns it.
import type { Canister, Client } from "@ic-reactor/core"
import type { MethodInfo } from "../interface/types.ts"
import type { DynActor } from "../lib/reactor.ts"

/**
 * The query options of a read, exactly as MethodRunner (`useQuery`) and the
 * SSR loader of a shared link (`queryClient.ensureQueryData`) both build
 * them, so a server-rendered result hydrates under the same key.
 *
 * `idempotent: true` reads an update method through
 * `{ update: "idempotent" }`: only for methods the registry names as
 * idempotent updates. `vars` may be `skipToken` (nothing submitted yet).
 */
export function readQueryOptions(
  client: Client,
  can: Canister<DynActor>,
  m: MethodInfo,
  vars: unknown,
  opts?: { idempotent?: boolean }
) {
  return opts?.idempotent === true
    ? client.queryOptions(can, m.name, vars, { update: "idempotent" })
    : client.queryOptions(can, m.name, vars)
}
