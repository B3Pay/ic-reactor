import { ClientManager, DisplayReactor } from "@ic-reactor/core"
import {
  ledgerCanisterId,
  ledgerIdlFactory,
  type Ledger,
} from "./declarations/ledger"
import { QueryClient } from "@tanstack/react-query"
import { createAuthHooks, createQuery } from "@ic-reactor/react"

export { ledgerCanisterId, ledgerIdlFactory, type Ledger }

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
    },
  },
})

export const clientManager = new ClientManager({
  withProcessEnv: true,
  queryClient,
})

export const { useAuth, useAuthState, useUserPrincipal } =
  createAuthHooks(clientManager)

// Imports moved to top

export const createLedgerQueries = async (reactor: DisplayReactor<Ledger>) => {
  const nameQuery = createQuery(reactor, {
    functionName: "icrc1_name",
  })

  const symbolQuery = createQuery(reactor, {
    functionName: "icrc1_symbol",
  })

  const decimalsQuery = createQuery(reactor, {
    functionName: "icrc1_decimals",
  })

  const owner = (await clientManager.getUserPrincipal()).toString()

  const balanceQuery = createQuery(reactor, {
    functionName: "icrc1_balance_of",
    args: [{ owner }],
  })

  return { nameQuery, symbolQuery, decimalsQuery, balanceQuery }
}

// @ts-ignore
window.__TANSTACK_QUERY_CLIENT__ = queryClient
