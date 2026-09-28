// `src/reactor/hooks.ts` of the createAuthHooks pages: the auth hooks bound to
// the `authentication` of `src/reactor/index.ts`.
import { createAuthHooks } from "@ic-reactor/react"
import { authentication } from "../index"

export const { useAuth, useUserPrincipal, useAgentState } =
  createAuthHooks(authentication)
