// `./reactor` of the createActorHooks pages: `backend`, a DisplayReactor of the
// pages' canister (`declarations/backend.ts`) with the six bound hooks and the
// auth hooks `defineDisplayReactor` returns.
import { defineDisplayReactor } from "@ic-reactor/react"
import { canisterId, idlFactory, type _SERVICE } from "./declarations/backend"

export const backendApp = defineDisplayReactor<_SERVICE>({
  name: "backend",
  idlFactory,
  canisterId,
})

export const {
  reactor: backend,
  clientManager,
  queryClient,
  authentication,
  identityAttributes,
  useActorQuery,
  useActorSuspenseQuery,
  useActorInfiniteQuery,
  useActorSuspenseInfiniteQuery,
  useActorMutation,
  useActorMethod,
  useAuth,
  useAgentState,
  useUserPrincipal,
  useIdentityAttributes,
} = backendApp
