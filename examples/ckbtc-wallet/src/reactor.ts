/**
 * IC Reactor Setup - ckBTC Wallet Example
 *
 * This file demonstrates how to set up reactors for interacting with
 * ckBTC Ledger and Minter canisters using the v3 API.
 */
import { ClientManager, DisplayReactor, Reactor } from "@ic-reactor/core"
import {
  createActorHooks,
  createAuthHooks,
  createMutation,
  createQueryFactory,
} from "@ic-reactor/react"
import { QueryClient } from "@tanstack/react-query"
import {
  idlFactory as ckbtcIdlFactory,
  type _SERVICE as CkbtcLedger,
} from "./declarations/ckbtc"
import {
  idlFactory as minterIdlFactory,
  type _SERVICE as CkbtcMinter,
} from "./declarations/minter"

// ============================================================================
// 1. Setup QueryClient and ClientManager
// ============================================================================

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000, // 30 seconds
    },
  },
})

export const clientManager = new ClientManager({
  withProcessEnv: true,
  queryClient,
})

// ============================================================================
// 2. Initialize Reactors
// ============================================================================

// ckBTC Ledger on testnet
export const ckbtcLedger = new Reactor<CkbtcLedger>({
  clientManager,
  canisterId: "mc6ru-gyaaa-aaaar-qaaaq-cai",
  idlFactory: ckbtcIdlFactory,
})

// ckBTC Minter on testnet
export const ckbtcMinter = new DisplayReactor<CkbtcMinter>({
  clientManager,
  canisterId: "ml52i-qqaaa-aaaar-qaaba-cai",
  idlFactory: minterIdlFactory,
})

// ============================================================================
// 3. Auth Hooks
// ============================================================================

export const { useAuth, useUserPrincipal, useAgentState } =
  createAuthHooks(clientManager)

// ============================================================================
// 4. Actor Hooks
// ============================================================================

// Ledger hooks
export const { useActorQuery: useCkbtcLedgerQuery } =
  createActorHooks(ckbtcLedger)

// ============================================================================
// 5. Specific Query and Mutation Factories (optional, for convenience)
// ============================================================================

// Balance query
export const balanceQuery = createQueryFactory(ckbtcLedger, {
  functionName: "icrc1_balance_of",
})

// Allowance query
export const allowanceQuery = createQueryFactory(ckbtcLedger, {
  functionName: "icrc2_allowance",
})

// Transfer mutation
export const transferMutation = createMutation(ckbtcLedger, {
  functionName: "icrc1_transfer",
})

// Approve mutation
export const approveMutation = createMutation(ckbtcLedger, {
  functionName: "icrc2_approve",
})

// BTC Address query
export const btcAddressQuery = createQueryFactory(ckbtcMinter, {
  functionName: "get_btc_address",
})

// Update balance mutation
export const updateBalanceMutation = createMutation(ckbtcMinter, {
  functionName: "update_balance",
})

// Retrieve BTC mutation
export const retrieveBtcMutation = createMutation(ckbtcMinter, {
  functionName: "retrieve_btc_with_approval",
})

// Minter canister ID for use in components
export const CKBTC_MINTER_CANISTER_ID = "ml52i-qqaaa-aaaar-qaaba-cai"
