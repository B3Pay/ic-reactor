// FOUNDATION: a working first version of the contract; B3 owns it.
import type { Canister } from "@ic-reactor/core"
import { useClient } from "@ic-reactor/react"
import type { CanisterInterface } from "../interface/types.ts"
import type { DynActor } from "../lib/reactor.ts"

/**
 * The canister object of an interface, for the app's client. Calling it on
 * every render is fine: `client.canister()` memoizes by service object and
 * target, and `interfaceFromPayload` keeps the service object stable.
 * `certified: true` gives the certified twin (its query methods go out as
 * replicated calls, under keys of their own).
 */
export function useCanisterHandle(
  iface: CanisterInterface,
  opts?: { certified?: boolean }
): Canister<DynActor> {
  const client = useClient()
  return client.canister<DynActor>(iface.actor, {
    id: iface.canisterId,
    certified: opts?.certified ?? false,
  })
}
