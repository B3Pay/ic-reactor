// `./reactor` of the documents that assume the guides' setup without showing
// it (the consumer guides check against their own `src/reactor.ts`):
// `defineDisplayReactor` over the backend.
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
