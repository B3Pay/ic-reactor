// `src/reactor/hooks.ts` of the framework pages: the hooks React Setup binds to
// `backend`, and the auth hooks over an `AuthenticationManager`.
import {
  AuthenticationManager,
  createActorHooks,
  createAuthHooks,
} from "@ic-reactor/react"
import { backend, clientManager } from "./index"

export const {
  useActorQuery,
  useActorMutation,
  useActorSuspenseQuery,
  useActorInfiniteQuery,
} = createActorHooks(backend)

export const authentication = new AuthenticationManager({ clientManager })

export const { useAuth, useUserPrincipal, useAgentState } =
  createAuthHooks(authentication)
