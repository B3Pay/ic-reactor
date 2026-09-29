// `src/reactor/hooks.ts` of the guides: the hooks bound to `backend`, and the
// auth hooks over the `AuthenticationManager` the setup built.
import { backendApp } from "./index"

export const {
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
