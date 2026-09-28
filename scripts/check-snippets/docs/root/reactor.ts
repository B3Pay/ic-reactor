// The setup the home page's "show me some code" example builds, a `Reactor`
// over the home page's canister with the hooks bound to it. The hooks are
// globals of the home page (`globals.ts`).
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
