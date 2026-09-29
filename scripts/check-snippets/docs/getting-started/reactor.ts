// `./reactor` of the getting-started pages: a raw `Reactor` over the pages'
// canister (`declarations/backend.ts`) with the six bound hooks
// `defineReactor` returns. A raw reactor takes and returns Candid values
// (`bigint`, `Principal`), as Why IC Reactor's examples show.
import { defineReactor } from "@ic-reactor/react"
import { canisterId, idlFactory, type _SERVICE } from "./declarations/backend"

export const backendApp = defineReactor<_SERVICE>({
  name: "backend",
  idlFactory,
  canisterId,
})

export const {
  reactor: backend,
  clientManager,
  queryClient,
  authentication,
  useActorQuery,
  useActorSuspenseQuery,
  useActorInfiniteQuery,
  useActorSuspenseInfiniteQuery,
  useActorMutation,
  useActorMethod,
} = backendApp
