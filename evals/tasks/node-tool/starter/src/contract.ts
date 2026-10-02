// The public boundary of the tool. Do not change this file.
import type { Identity } from "@icp-sdk/core/agent"

/** Where the ledger is and who signs transfers. */
export interface LedgerToolConfig {
  /** The replica URL, e.g. "https://icp-api.io" or "http://127.0.0.1:4943". */
  host: string
  /** The ICRC-1 ledger canister id, as principal text. */
  canisterId: string
  /** The root key of a local replica. Absent on mainnet. */
  rootKey?: Uint8Array
  /** Who signs transfers. Absent or anonymous: the tool is read-only. */
  identity?: Identity
}

export type TransferResult =
  | { ok: true; blockIndex: bigint }
  | {
      ok: false
      /** True when the ledger may have executed the transfer anyway. */
      mayHaveExecuted: boolean
      /** A human-readable reason. */
      reason: string
    }

export interface LedgerTool {
  /** Base units held by the default account of `owner` (principal text). */
  getBalance(owner: string): Promise<bigint>
  /** Send `amount` (whole tokens, decimal text) to `to` (principal text). */
  transfer(args: { to: string; amount: string }): Promise<TransferResult>
}
