/**
 * ICRC1Provider - Custom Provider with Dynamic Canister ID
 *
 * A provider that builds a Reactor for the ICRC1 canister it is given and
 * exposes that reactor's hooks to the components below it.
 *
 * `createReactorProvider` runs the factory once, when the provider mounts,
 * with the provider's props. App renders it with `key={canisterId}`, so a new
 * canister ID is a new provider: React unmounts the old one and this factory
 * builds a reactor for the new ID. Every reactor shares the app's
 * `ClientManager`, so one sign-in covers every token, and each canister's
 * queries are cached under its own ID.
 *
 * `useICRC1Context()` returns what the factory built, typed as its return
 * value, so `hooks.useActorQuery` keeps its own signature.
 */
import {
  Reactor,
  createActorHooks,
  createReactorProvider,
} from "@ic-reactor/react"
import { idlFactory, type ICRC1 } from "./declarations/icrc1"
import { clientManager } from "./reactor"

const { ReactorProvider, useReactor } = createReactorProvider(
  ({ canisterId }: { canisterId: string }) => {
    const reactor = new Reactor<ICRC1>({
      name: "icrc1",
      clientManager,
      canisterId,
      idlFactory,
    })
    return { canisterId, hooks: createActorHooks(reactor) }
  }
)

export const useICRC1Context = useReactor

export default ReactorProvider
