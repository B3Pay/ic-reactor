import { ClientManager } from "@ic-reactor/core"
import {
  AuthenticationManager,
  IdentityAttributesManager,
} from "@ic-reactor/auth"
import {
  createAuthHooks,
  createIdentityAttributeHooks,
} from "@ic-reactor/auth-react"
import { QueryClient } from "@tanstack/react-query"

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
    },
  },
})

export const clientManager = new ClientManager({
  queryClient,
})

export const authentication = new AuthenticationManager({ clientManager })
export const identityAttributes = new IdentityAttributesManager(authentication)

export const { useAuth, useUserPrincipal } = createAuthHooks(authentication)
export const { useIdentityAttributes } =
  createIdentityAttributeHooks(identityAttributes)
