// `src/auth.ts`: auth hooks built by hand over the backend's `ClientManager`.
import {
  AuthenticationManager,
  IdentityAttributesManager,
  createAuthHooks,
  createIdentityAttributeHooks,
} from "@ic-reactor/react"
import { clientManager } from "./reactor"

export const authentication = new AuthenticationManager({ clientManager })
export const { useAuth, useAgentState, useUserPrincipal } =
  createAuthHooks(authentication)

export const identityAttributes = new IdentityAttributesManager(authentication)
export const { useIdentityAttributes } =
  createIdentityAttributeHooks(identityAttributes)
