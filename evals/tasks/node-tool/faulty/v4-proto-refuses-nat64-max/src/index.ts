import {
  createClient,
  isPrincipalText,
  isReactorError,
} from "@ic-reactor/v4-proto"
import { LedgerService } from "./generated/icrc1.service"
import type { LedgerTool, LedgerToolConfig, TransferResult } from "./contract"

export type { LedgerTool, LedgerToolConfig, TransferResult } from "./contract"

const NAT64_MAX = 18_446_744_073_709_551_615n

function parseAmount(text: string): bigint | undefined {
  const match = /^(\d+)(?:\.(\d{1,8}))?$/.exec(text)
  if (!match) return undefined
  const units =
    BigInt(match[1]) * 100_000_000n + BigInt((match[2] ?? "").padEnd(8, "0"))
  return units < NAT64_MAX ? units : undefined
}

const refused = (reason: string): TransferResult => ({
  ok: false,
  mayHaveExecuted: false,
  reason,
})

export function createLedgerTool(config: LedgerToolConfig): LedgerTool {
  const client = createClient({
    network: { host: config.host, rootKey: config.rootKey },
    identity: config.identity,
  })
  const ledger = client.canister(LedgerService, { id: config.canisterId })

  return {
    async getBalance(owner) {
      if (!isPrincipalText(owner))
        throw new TypeError(`not a principal: ${owner}`)
      return ledger.icrc1_balance_of([{ owner, subaccount: null }])
    },

    async transfer({ to, amount }) {
      const units = parseAmount(amount)
      if (units === undefined)
        return refused(`invalid amount: ${JSON.stringify(amount)}`)
      if (!isPrincipalText(to))
        return refused(`invalid recipient: ${JSON.stringify(to)}`)
      try {
        const blockIndex = await ledger.icrc1_transfer([
          {
            to: { owner: to, subaccount: null },
            amount: units,
            fee: null,
            memo: null,
            from_subaccount: null,
            created_at_time: null,
          },
        ])
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
