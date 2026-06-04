import { AuthenticationManager } from "@ic-reactor/auth"
import { createAuthHooks } from "@ic-reactor/auth-react"
import { clientManager } from "./client"

export const authentication = new AuthenticationManager({
  clientManager,
  identityProvider: "http://id.ai.localhost:8000/authorize",
})
export const { useAuth, useAgentState, useUserPrincipal } =
  createAuthHooks(authentication)
