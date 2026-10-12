import type { Canister, Client } from "@ic-reactor/core"
import { useClient } from "@ic-reactor/react"
import type { CanisterInterface } from "../interface/types.ts"
import type { DynActor } from "../lib/reactor.ts"

/**
 * The canister object of an interface on `client`: the same object for the
 * same service schema and target, which `client.canister()` memoizes, and
 * which `resendOf` and the three-argument `isReactorError` compare by
 * identity. `interfaceFromPayload` keeps the service object stable per .did.
 */
export function canisterOf(
  client: Client,
  iface: CanisterInterface,
  certified = false
): Canister<DynActor> {
  return client.canister<DynActor>(iface.actor, {
    id: iface.canisterId,
    certified,
  })
}

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
  return canisterOf(useClient(), iface, opts?.certified ?? false)
}
