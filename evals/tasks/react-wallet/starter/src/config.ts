// Where the ledger is. Do not change this file.
export interface LedgerConfig {
  /** The replica URL, e.g. "https://icp-api.io" or "http://127.0.0.1:4943". */
  host: string
  /** The ICRC-1 ledger canister id, as principal text. */
  canisterId: string
  /** The root key of a local replica. Absent on mainnet. */
  rootKey?: Uint8Array
}

export const MAINNET_ICP_LEDGER: LedgerConfig = {
  host: "https://icp-api.io",
  canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
}
