/**
 * IC Reactor Setup - createSuspenseQuery & createSuspenseQueryFactory Demo
 *
 * This file demonstrates how to set up the reactor store and create
 * reusable query wrappers using createSuspenseQuery and createSuspenseQueryFactory.
 *
 * Use createSuspenseQuery when you want:
 * - Data to always be defined (no undefined checks)
 * - React Suspense for loading states
 *
 * Use createQuery when you need:
 * - The `enabled` option for conditional fetching
 * - Manual loading state handling with isLoading/isPending
 */
import { ClientManager, DisplayReactor } from "@ic-reactor/core"
import {
  createSuspenseQuery,
  createSuspenseQueryFactory,
  createMutation,
  createAuthHooks,
} from "@ic-reactor/react"
import { QueryClient } from "@tanstack/react-query"
import { ledgerIdlFactory, type Ledger } from "./declarations/ledger"

// ============================================================================
// 1. Setup QueryClient and AgentManager
// ============================================================================

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
})

export const clientManager = new ClientManager({
  withProcessEnv: true,
  queryClient,
})

// ============================================================================
// 2. Initialize Reactors Directly (using DisplayReactor for transformations)
// ============================================================================

// ICP Ledger with DisplayReactor for human-readable display values
export const icpReactor = new DisplayReactor<Ledger>({
  clientManager,
  name: "icp",
  canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
  idlFactory: ledgerIdlFactory,
})

// ckBTC Ledger
export const ckBTCReactor = new DisplayReactor<Ledger>({
  clientManager,
  name: "ckbtc",
  canisterId: "mxzaz-hqaaa-aaaar-qaada-cai",
  idlFactory: ledgerIdlFactory,
})

// ckETH Ledger
export const ckETHReactor = new DisplayReactor<Ledger>({
  clientManager,
  name: "cketh",
  canisterId: "ss2fx-dyaaa-aaaar-qacoq-cai",
  idlFactory: ledgerIdlFactory,
})

// ============================================================================
// 4. createSuspenseQuery - Static Queries (no args needed)
// ============================================================================

/**
 * Simple query without any arguments.
 * Returns the token name.
 */
export const icpNameQuery = createSuspenseQuery(icpReactor, {
  functionName: "icrc1_name",
})

/**
 * Query with `select` transformation.
 * Returns just the symbol string instead of the full response.
 */
export const icpSymbolQuery = createSuspenseQuery(icpReactor, {
  functionName: "icrc1_symbol",
})

/**
 * Query with custom staleTime.
 * Total supply doesn't change often, so we can cache it longer.
 */
export const icpTotalSupplyQuery = createSuspenseQuery(icpReactor, {
  functionName: "icrc1_total_supply",
  staleTime: 10 * 60 * 1000, // 10 minutes
  // Transform the raw balance into a formatted string with commas
  select: (supply) => {
    const num = parseFloat(supply)
    return (
      new Intl.NumberFormat("en-US", {
        maximumFractionDigits: 2,
        notation: "compact",
        compactDisplay: "short",
      }).format(num) + " ICP"
    )
  },
})

/**
 * Query for transfer fee - useful for showing fee before transfers.
 * Uses select to add the ICP suffix.
 */
export const icpFeeQuery = createSuspenseQuery(icpReactor, {
  functionName: "icrc1_fee",
  select: (fee) => `${fee} ICP`,
})

// ============================================================================
// 5. Helper for formatting balances
// ============================================================================

// Token decimals (all are 8 for ICP ecosystem tokens)
const TOKEN_DECIMALS: Record<string, number> = {
  ICP: 8,
  ckBTC: 8,
  ckETH: 18, // ckETH has 18 decimals like ETH
}

/**
 * Helper function to format balances from e8s to human-readable format.
 * The DisplayReactor returns the balance as a string in the smallest unit (e8s).
 * We need to divide by 10^decimals to get the actual token amount.
 */
const formatBalance = (balance: string, symbol: string) => {
  const decimals = TOKEN_DECIMALS[symbol] ?? 8
  const raw = parseFloat(balance.replace(/,/g, ""))
  const actual = raw / Math.pow(10, decimals)

  // Format with appropriate precision
  if (actual === 0) {
    return `0 ${symbol}`
  }

  // Use compact notation for large amounts, fixed for small
  if (actual >= 1000) {
    return (
      new Intl.NumberFormat("en-US", {
        maximumFractionDigits: 2,
        notation: "compact",
        compactDisplay: "short",
      }).format(actual) + ` ${symbol}`
    )
  }

  // For smaller amounts, show more precision
  return (
    new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: actual < 1 ? 6 : 4,
    }).format(actual) + ` ${symbol}`
  )
}

// ============================================================================
// 6. createSuspenseQueryFactory - Dynamic Queries with Select Transformations
// ============================================================================

/**
 * Factory for ICP balance queries with formatted output.
 * Pass account at call time - perfect for user-specific data.
 */
export const getIcpBalance = createSuspenseQueryFactory(icpReactor, {
  functionName: "icrc1_balance_of",
  refetchInterval: 5 * 1000, // 5 seconds
  select: (balance) => formatBalance(balance, "ICP"),
})

/**
 * Factory for ckBTC balance queries with formatted output.
 */
export const getCkBtcBalance = createSuspenseQueryFactory(ckBTCReactor, {
  functionName: "icrc1_balance_of",
  select: (balance) => formatBalance(balance, "ckBTC"),
})

/**
 * Factory for ckETH balance queries with formatted output.
 */
export const getCkEthBalance = createSuspenseQueryFactory(ckETHReactor, {
  functionName: "icrc1_balance_of",
  select: (balance) => formatBalance(balance, "ckETH"),
})

// ============================================================================
// 7. Auth Hooks
// ============================================================================

/**
 * useAuth() automatically initializes the session on first use,
 * restoring any previous session from IndexedDB.
 */
export const { useAuth, useUserPrincipal } = createAuthHooks(clientManager)

// ============================================================================
// 8. createMutation - Transfer Functions
// ============================================================================

/**
 * ICP Transfer mutation.
 * Uses DisplayReactor so you can pass string amounts and principals.
 *
 * Example usage:
 * const { mutate, isPending, error } = icpTransferMutation.useMutation()
 * mutate([{ to: { owner: "...", subaccount: null }, amount: "100000000", ... }])
 */
export const icpTransferMutation = createMutation(icpReactor, {
  functionName: "icrc1_transfer",
  invalidateQueries: [],
  onSuccess: (txId) => {
    console.log("Transfer successful! Transaction ID:", txId)
  },
})
