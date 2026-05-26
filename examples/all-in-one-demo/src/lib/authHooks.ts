import { AuthenticationManager } from "@ic-reactor/auth"
import { createAuthHooks } from "@ic-reactor/auth-react"
import { clientManager } from "./client"

export const authentication = new AuthenticationManager({ clientManager })
export const { useAuth, useAgentState, useUserPrincipal } =
  createAuthHooks(authentication)
