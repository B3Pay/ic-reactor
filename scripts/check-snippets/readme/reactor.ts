// `src/reactor.ts` of the root README: `defineReactor` over `my_canister`.
import { defineReactor } from "@ic-reactor/react"
import { idlFactory, type _SERVICE } from "../app/declarations/my_canister"

export const {
  reactor: backendReactor,
  queryClient,
  clientManager,
  useActorQuery,
  useActorMutation,
  useAuth,
} = defineReactor<_SERVICE>({
  name: "backend",
  idlFactory,
  canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
})
