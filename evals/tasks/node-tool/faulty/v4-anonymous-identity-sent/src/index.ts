import { createClient, isReactorError, parseUnits } from "@ic-reactor/core"
import { isPrincipal } from "@candid-core/schema"
import { actor, type Actor } from "./generated/icrc1"
import type { LedgerTool, LedgerToolConfig, TransferResult } from "./contract"

export type { LedgerTool, LedgerToolConfig, TransferResult } from "./contract"

const NAT64_MAX = 18_446_744_073_709_551_615n

function parseAmount(text: string): bigint | undefined {
  // The task refuses more than 8 fraction digits as written; parseUnits
  // ignores trailing zeros past the decimals ("1.123456780"), so count them.
  if ((text.split(".")[1]?.length ?? 0) > 8) return undefined
  let units: bigint
  try {
    units = parseUnits(text, 8)
  } catch {
    return undefined
  }
  return units <= NAT64_MAX ? units : undefined
}

const refused = (reason: string): TransferResult => ({
  ok: false,
  mayHaveExecuted: false,
  reason,
})

export function createLedgerTool(config: LedgerToolConfig): LedgerTool {
  const client = createClient({
    network: { host: config.host, rootKey: config.rootKey },
    identity: config.identity ?? "anonymous",
  })
  const ledger = client.canister<Actor>(actor, { id: config.canisterId })

  return {
    async getBalance(owner) {
      if (!isPrincipal(owner)) throw new TypeError(`not a principal: ${owner}`)
      return ledger.icrc1_balance_of({ owner, subaccount: null })
    },

    async transfer({ to, amount }) {
      const units = parseAmount(amount)
      if (units === undefined)
        return refused(`invalid amount: ${JSON.stringify(amount)}`)
      if (!isPrincipal(to))
        return refused(`invalid recipient: ${JSON.stringify(to)}`)
      try {
        const blockIndex = await ledger.icrc1_transfer({
          to: { owner: to, subaccount: null },
          amount: units,
          fee: null,
          memo: null,
          from_subaccount: null,
          created_at_time: null,
        })
        return { ok: true, blockIndex }
      } catch (error) {
        if (!isReactorError(error)) throw error
        return {
          ok: false,
          mayHaveExecuted: error.mayHaveExecuted,
          reason:
            error.kind === "canister_err"
              ? `ledger refused: ${error.message}`
              : error.message,
        }
      }
    },
  }
}
