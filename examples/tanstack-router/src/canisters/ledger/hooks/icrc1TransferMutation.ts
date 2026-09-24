/**
 * Mutation Hook: icrc1_transfer
 *
 * Hand-maintained, not codegen output. Codegen's `factories: true` generates
 * the createQuery, createQueryFactory and createMutation kinds for every
 * method (see examples/codegen-in-action), but not the suspense ones used here.
 * This hook wraps the icrc1_transfer update method.
 *
 * @example
 * // Use the hook in a component
 * const { mutate, isPending } = useIcrc1TransferMutation()
 *
 * // Call the mutation
 * mutate([transferArg])
 *
 * // Or execute directly
 * const result = await executeIcrc1Transfer([transferArg])
 */

import { createMutation } from "@ic-reactor/react"
import { ledgerReactor } from "../reactor"
import { icrc1BalanceOfSuspenseQuery } from "./icrc1BalanceOfSuspenseQuery"

// ═══════════════════════════════════════════════════════════════════════════
// MUTATION INSTANCE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Mutation for icrc1_transfer
 *
 * Provides:
 * - .useMutation() - React hook
 * - .execute() - Direct execution
 */
export const icrc1TransferMutation = createMutation(ledgerReactor, {
  functionName: "icrc1_transfer",
  // ─────────────────────────────────────────────────────────────────────────
  // INVALIDATION
  // ─────────────────────────────────────────────────────────────────────────
  // Awaited before onSuccess. The query factory covers every balance it has
  // returned, whatever the account: a transfer changes both the sender's and
  // the recipient's. An entry can also be a query object, a query key, or a
  // method of the reactor such as `{ functionName: "icrc1_total_supply" }`.
  invalidateQueries: [icrc1BalanceOfSuspenseQuery],

  // ─────────────────────────────────────────────────────────────────────────
  // SUCCESS HANDLER
  // ─────────────────────────────────────────────────────────────────────────
  // onSuccess: (data, variables, context) => {
  //   console.log("icrc1_transfer succeeded:", data)
  // },

  // ─────────────────────────────────────────────────────────────────────────
  // ERROR HANDLERS
  // ─────────────────────────────────────────────────────────────────────────
  // Handle canister-level errors (from Result { Err })
  // onCanisterError: (error, variables) => {
  //   console.error("Canister error:", error)
  // },

  // Handle all errors (network, canister, etc.)
  // onError: (error, variables, context) => {
  //   console.error("Error:", error)
  // },
})

// ═══════════════════════════════════════════════════════════════════════════
// CONVENIENCE EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * React hook for icrc1_transfer
 *
 * @param options - Mutation options (onSuccess, onError, etc.)
 */
export const useIcrc1TransferMutation = icrc1TransferMutation.useMutation

/**
 * Execute icrc1_transfer directly (outside of React)
 *
 * @param args - Arguments to pass to the canister method
 */
export const executeIcrc1Transfer = icrc1TransferMutation.execute
