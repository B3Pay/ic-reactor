// `./reactor` of the home page's "Best of Both Worlds" example: the setup its
// "show me some code" example builds, a `Reactor` over the home page's canister
// with the hooks bound to it.
import { ClientManager, Reactor, createActorHooks } from "@ic-reactor/react"
import { QueryClient } from "@tanstack/react-query"
import { canisterId, idlFactory, type _SERVICE } from "./declarations/backend"

export const queryClient = new QueryClient()
export const clientManager = new ClientManager({ queryClient })

export const backend = new Reactor<_SERVICE>({
  clientManager,
  idlFactory,
  name: "backend",
  canisterId,
})

export const { useActorQuery, useActorMutation } = createActorHooks(backend)
