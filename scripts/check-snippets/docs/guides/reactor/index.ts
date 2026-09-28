// `src/reactor/index.ts` of the guides: a `DisplayReactor` over the guides'
// canister (`declarations/backend.ts`), with its `ClientManager` and
// `QueryClient`, and everything `defineDisplayReactor` returns for the hooks.
import { defineDisplayReactor } from "@ic-reactor/react"
import { canisterId, idlFactory, type _SERVICE } from "../declarations/backend"

export const backendApp = defineDisplayReactor<_SERVICE>({
  name: "backend",
  idlFactory,
  canisterId,
})

export const { reactor: backend, clientManager, queryClient } = backendApp
