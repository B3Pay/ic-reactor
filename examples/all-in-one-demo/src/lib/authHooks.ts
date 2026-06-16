import { AuthenticationManager } from "@ic-reactor/react"
import { createAuthHooks } from "@ic-reactor/react"
import { clientManager } from "./client"

export const authentication = new AuthenticationManager({
  clientManager,
})
export const { useAuth, useAgentState, useUserPrincipal } =
  createAuthHooks(authentication)
