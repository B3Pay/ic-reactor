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
 * `can` decides certification: the certified twin's keys end in
 * "certified", so the loader must build the same twin the runner shows.
 *
 * @throws TypeError, from `client.queryOptions`, for a oneway, a method
 * without results, an update without `idempotent`, or a composite query on
 * the certified twin: `callKindOf` keeps those away from here.
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
