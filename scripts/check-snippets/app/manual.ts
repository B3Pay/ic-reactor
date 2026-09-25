// `src/manual.ts` of the guides: the same backend, built step by step.
import {
  ClientManager,
  DisplayReactor,
  createActorHooks,
  reactorRetry,
} from "@ic-reactor/react"
import { QueryClient } from "@tanstack/react-query"
import { canisterId, idlFactory, type _SERVICE } from "./declarations/backend"

export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: reactorRetry } },
})
export const clientManager = new ClientManager({ queryClient })

export const backend = new DisplayReactor<_SERVICE>({
  clientManager,
  idlFactory,
  name: "backend",
  canisterId,
})

export const { useActorQuery, useActorMutation } = createActorHooks(backend)
