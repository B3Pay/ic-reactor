/**
 * IC Reactor Setup - Multiple Provider Example (ICDV Donation)
 *
 * This file demonstrates how to set up multiple reactors for interacting with
 * both ICP Ledger and ICDV canisters using the v3 API.
 */
import { ClientManager, Reactor } from "@ic-reactor/core"
import {
  createActorHooks,
  createAuthHooks,
  createQuery,
  createMutation,
  createQueryFactory,
} from "@ic-reactor/react"
import { QueryClient } from "@tanstack/react-query"
import {
  idlFactory as icrc2IdlFactory,
  type _SERVICE as ICRC2,
} from "./declarations/icrc2"
import {
  idlFactory as icdvIdlFactory,
  type _SERVICE as ICDV,
} from "./declarations/icdv"

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

// ICP Ledger (ICRC2)
export const icpLedger = new Reactor<ICRC2>({
  name: "ICP Ledger",
  clientManager,
  canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
  idlFactory: icrc2IdlFactory,
})

// ICDV Token
export const icdvToken = new Reactor<ICDV>({
  name: "ICDV Token",
  clientManager,
  canisterId: "agtsn-xyaaa-aaaag-ak3kq-cai",
  idlFactory: icdvIdlFactory,
})

// ============================================================================
// 3. Auth Hooks
// ============================================================================

export const { useAuth, useUserPrincipal, useAgentState } =
  createAuthHooks(clientManager)

// ============================================================================
// 4. Actor Hooks
// ============================================================================

// ICP Ledger hooks
export const { useActorQuery: useICPQuery, useActorMutation: useICPMutation } =
  createActorHooks(icpLedger)

// ICDV Token hooks
export const {
  useActorQuery: useICDVQuery,
  useActorMutation: useICDVMutation,
} = createActorHooks(icdvToken)

// ============================================================================
// 5. Specific Query and Mutation Factories
// ============================================================================

// ICP Queries
export const icpNameQuery = createQuery(icpLedger, {
  functionName: "icrc1_name",
})
export const icpBalanceQuery = createQueryFactory(icpLedger, {
  functionName: "icrc1_balance_of",
})
export const icpAllowanceQuery = createQueryFactory(icpLedger, {
  functionName: "icrc2_allowance",
})

// ICP Mutations
export const icpApproveMutation = createMutation(icpLedger, {
  functionName: "icrc2_approve",
})

// ICDV Queries
export const icdvNameQuery = createQuery(icdvToken, {
  functionName: "icrc1_name",
})

export const icdvStatsQuery = createQuery(icdvToken, {
  functionName: "stats",
})

export const icdvTotalSupplyQuery = createQuery(icdvToken, {
  functionName: "icrc1_total_supply",
})

export const icdvBalanceQuery = createQueryFactory(icdvToken, {
  functionName: "icrc1_balance_of",
})

export const icdvHoldersQuery = createQueryFactory(icdvToken, {
  functionName: "holders",
})

// ICDV Mutations
export const icdvMintFromICPMutation = createMutation(icdvToken, {
  functionName: "mintFromICP",
})

// ============================================================================
// 6. Canister IDs for reference
// ============================================================================

export const ICDV_CANISTER_ID = "agtsn-xyaaa-aaaag-ak3kq-cai"
export const ICP_LEDGER_CANISTER_ID = "ryjl3-tyaaa-aaaaa-aaaba-cai"
