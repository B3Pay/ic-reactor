// `src/reactor.ts` of the React README: a raw `Reactor` built step by step.
import { ClientManager, Reactor, createActorHooks } from "@ic-reactor/react"
import { QueryClient } from "@tanstack/react-query"
import { canisterId, idlFactory, type _SERVICE } from "./declarations/backend"

export const queryClient = new QueryClient()

export const clientManager = new ClientManager({
  queryClient,
})

export const backend = new Reactor<_SERVICE>({
  clientManager,
  idlFactory,
  name: "backend",
  canisterId,
})

export const {
  useActorQuery,
  useActorMutation,
  useActorSuspenseQuery,
  useActorMethod,
} = createActorHooks(backend)
