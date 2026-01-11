import { createAuthHooks } from "@ic-reactor/react"
import { clientManager } from "./client"

export const { useAuth, useAgentState, useUserPrincipal } =
  createAuthHooks(clientManager)
