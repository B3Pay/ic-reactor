import { HttpAgent } from "@icp-sdk/core/agent"
import { Principal } from "@icp-sdk/core/principal"
import { ActorError, createActor } from "@candid-core/schema/actor"
import { httpTransport } from "@candid-core/schema/transport-icp"
import { actor, type Actor } from "./generated/icrc1"
import type { LedgerTool, LedgerToolConfig, TransferResult } from "./contract"

export type { LedgerTool, LedgerToolConfig, TransferResult } from "./contract"

const NAT64_MAX = 18_446_744_073_709_551_615n
const DECIMALS = 8
const MAINNET = /(^|\.)(icp-api\.io|ic0\.app|icp0\.io)$/

/** Whole-token decimal text → base units, or undefined when refused. */
function parseAmount(text: string): bigint | undefined {
  const match = /^(\d+)(?:\.(\d{1,8}))?$/.exec(text)
  if (!match) return undefined
  const units =
    BigInt(match[1]) * 10n ** BigInt(DECIMALS) +
    BigInt((match[2] ?? "").padEnd(DECIMALS, "0"))
  return units <= NAT64_MAX ? units : undefined
}

function parsePrincipal(text: string): Principal | undefined {
  try {
    return Principal.fromText(text)
  } catch {
    return undefined
  }
}

/**
 * Whether a failed update may still have run. The agent throws its own
 * errors untouched through the candid-core transport; only a failure that
 * proves no ledger code ran (refused, or a system reject: codes 1-3) is
 * "no"; a reject from the ledger's own code (4, 5) may follow a commit.
 */
function mayHaveExecuted(error: unknown): boolean {
  if (error instanceof ActorError) {
    // AWKWARD: ActorError carries no stage field; the message says which.
    return !error.message.startsWith("encode")
  }
  const shape = error as {
    kind?: unknown
    code?: { name?: unknown; rejectCode?: unknown; status?: unknown }
  }
  const rejectCode = shape?.code?.rejectCode
  // Reject codes 1-3 come from the system before any canister code runs;
  // 4 and 5 come from the canister's own code, which may have committed.
  if (typeof rejectCode === "number") return rejectCode > 3
  if (
    shape?.code?.name === "HttpErrorCode" &&
    typeof shape.code.status === "number"
  ) {
    const status = shape.code.status
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
  const local = !MAINNET.test(new URL(config.host).hostname)
  const agent = HttpAgent.createSync({
    host: config.host,
    ...(config.identity ? { identity: config.identity } : {}),
    ...(config.rootKey ? { rootKey: config.rootKey } : {}),
    shouldFetchRootKey: !config.rootKey && local,
  })
  const ledger = createActor<Actor>(
    actor,
    config.canisterId,
    httpTransport({ agent })
  )
  const signedIn =
    config.identity !== undefined &&
    !config.identity.getPrincipal().isAnonymous()

  return {
    async getBalance(owner) {
      const principal = parsePrincipal(owner)
      if (!principal) throw new TypeError(`not a principal: ${owner}`)
      return ledger.icrc1_balance_of({ owner: principal, subaccount: null })
    },

    async transfer({ to, amount }) {
      const units = parseAmount(amount)
      if (units === undefined)
        return refused(`invalid amount: ${JSON.stringify(amount)}`)
      const recipient = parsePrincipal(to)
      if (!recipient) return refused(`invalid recipient: ${JSON.stringify(to)}`)
      if (!signedIn) return refused("no identity: the tool is read-only")
      try {
        const result = await ledger.icrc1_transfer({
          to: { owner: recipient, subaccount: null },
          amount: units,
          fee: null,
          memo: null,
          from_subaccount: null,
          created_at_time: null,
        })
        if (result.tag === "Ok") return { ok: true, blockIndex: result.value }
        return refused(`ledger refused: ${result.value.tag}`)
      } catch (error) {
        return {
          ok: false,
          mayHaveExecuted: mayHaveExecuted(error),
          reason: error instanceof Error ? error.message : String(error),
        }
      }
    },
  }
}
