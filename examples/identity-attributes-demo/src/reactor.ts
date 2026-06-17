import { ClientManager } from "@ic-reactor/react"
import {
  AuthenticationManager,
  IdentityAttributesManager,
} from "@ic-reactor/react"
import {
  createAuthHooks,
  createIdentityAttributeHooks,
} from "@ic-reactor/react"
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
