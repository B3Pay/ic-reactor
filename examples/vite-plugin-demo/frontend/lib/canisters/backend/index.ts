import { DisplayReactor, createActorHooks } from "@ic-reactor/react"
import { clientManager } from "../../clients"
import { idlFactory, type _SERVICE } from "./declarations/backend.did"

export type BackendService = _SERVICE

/**
 * Backend Display Reactor
 */
export const backendReactor = new DisplayReactor<BackendService>({
  clientManager,
  idlFactory,
  name: "backend",
})

export const {
  useActorQuery: useBackendQuery,
  useActorSuspenseQuery: useBackendSuspenseQuery,
  useActorInfiniteQuery: useBackendInfiniteQuery,
  useActorSuspenseInfiniteQuery: useBackendSuspenseInfiniteQuery,
  useActorMutation: useBackendMutation,
  useActorMethod: useBackendMethod,
} = createActorHooks(backendReactor)
