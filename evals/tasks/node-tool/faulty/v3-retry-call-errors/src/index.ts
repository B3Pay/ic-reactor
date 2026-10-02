import {
  ClientManager,
  Reactor,
  isCallError,
  isCanisterError,
  isValidationError,
  parseTokenAmount,
} from "@ic-reactor/core"
import { QueryClient } from "@tanstack/query-core"
import { Principal } from "@icp-sdk/core/principal"
import { idlFactory, type _SERVICE } from "./declarations/icrc1.did"
import type { LedgerTool, LedgerToolConfig, TransferResult } from "./contract"

export type { LedgerTool, LedgerToolConfig, TransferResult } from "./contract"

const NAT64_MAX = 18_446_744_073_709_551_615n

function parseAmount(text: string): bigint | undefined {
  // parseTokenAmount refuses non-digits, a sign and extra fraction digits.
  if (!/^\d+(\.\d+)?$/.test(text)) return undefined
  try {
    const units = parseTokenAmount(text, 8)
    return units <= NAT64_MAX ? units : undefined
  } catch {
    return undefined
  }
}

function parsePrincipal(text: string): Principal | undefined {
  try {
    return Principal.fromText(text)
  } catch {
    return undefined
  }
}

/**
 * Whether a failed update may still have run. A CanisterError (the ledger
 * returned Err) and a ValidationError did not; a CallError did not when its
 * cause proves the call never ran (no agent error: encoding failed; an HTTP
 * 4xx refusal; a system reject, codes 1-3). A reject from the canister's
 * own code (4, 5) does not prove it: the canister may have committed first. Everything else — transport failures, timeouts, 5xx — may have.
 */
function mayHaveExecuted(error: unknown): boolean {
  if (isCanisterError(error) || isValidationError(error)) return false
  if (!isCallError(error)) return true
  const cause = error.cause as
    | {
        kind?: unknown
        code?: { name?: unknown; rejectCode?: unknown; status?: unknown }
      }
    | undefined
  if (!cause || typeof cause.kind !== "string") return false
  const rejectCode = cause.code?.rejectCode
  // Reject codes 1-3 come from the system before any canister code runs;
  // 4 and 5 come from the canister's own code, which may have committed.
  if (typeof rejectCode === "number") return rejectCode > 3
  if (
    cause.code?.name === "HttpErrorCode" &&
    typeof cause.code.status === "number"
  ) {
    const status = cause.code.status
    return !(status >= 400 && status < 500 && status !== 408)
  }
  return true
}

const refused = (reason: string): TransferResult => ({
  ok: false,
  mayHaveExecuted: false,
  reason,
})

export function createLedgerTool(config: LedgerToolConfig): LedgerTool {
  // Built per tool, never shared: the cache is not used for reads anyway.
  const clientManager = new ClientManager({
    queryClient: new QueryClient(),
    agentOptions: {
      host: config.host,
      ...(config.rootKey ? { rootKey: config.rootKey } : {}),
    },
  })
  if (config.identity) clientManager.updateAgent(config.identity)
  const ledger = new Reactor<_SERVICE>({
    clientManager,
    idlFactory,
    name: "ledger",
    canisterId: config.canisterId,
  })
  const signedIn =
    config.identity !== undefined &&
    !config.identity.getPrincipal().isAnonymous()

  return {
    async getBalance(owner) {
      const principal = parsePrincipal(owner)
      if (!principal) throw new TypeError(`not a principal: ${owner}`)
      // callMethod skips the cache: always the ledger's current balance.
      return ledger.callMethod({
        functionName: "icrc1_balance_of",
        args: [{ owner: principal, subaccount: [] }],
      })
    },

    async transfer({ to, amount }) {
      const units = parseAmount(amount)
      if (units === undefined)
        return refused(`invalid amount: ${JSON.stringify(amount)}`)
      const recipient = parsePrincipal(to)
      if (!recipient) return refused(`invalid recipient: ${JSON.stringify(to)}`)
      if (!signedIn) return refused("no identity: the tool is read-only")
      const send = () =>
        ledger.callMethod({
          functionName: "icrc1_transfer",
          args: [
            {
              to: { owner: recipient, subaccount: [] },
              amount: units,
              fee: [],
              memo: [],
              from_subaccount: [],
              created_at_time: [],
            },
          ],
        })
      let lastError: unknown
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          return { ok: true, blockIndex: await send() }
        } catch (error) {
          lastError = error
          if (!isCallError(error)) break
        }
      }
      {
        const error = lastError
        return {
          ok: false,
          mayHaveExecuted: mayHaveExecuted(error),
          reason: isCanisterError(error)
            ? `ledger refused: ${error.code}`
            : error instanceof Error
              ? error.message
              : String(error),
        }
      }
    },
  }
}
