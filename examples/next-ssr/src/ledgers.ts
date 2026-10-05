// The canisters this app reads on mainnet, by canister id. A server render has
// no `ic_env` cookie to resolve a `{ name }` from, so every canister the server
// calls is an `{ id }` target. Plain data with no imports, so that
// scripts/smoke.ts can load it under Node as it is.

export interface LedgerRef {
  /** The ledger's canister id on mainnet. */
  readonly id: string
  /** What the page calls it, and what the route handler accepts in its place. */
  readonly label: string
}

/** The ICRC-1 ledgers every page reads. */
export const LEDGERS: readonly LedgerRef[] = [
  { id: "ryjl3-tyaaa-aaaaa-aaaba-cai", label: "ICP" },
  { id: "mxzaz-hqaaa-aaaar-qaada-cai", label: "ckBTC" },
  { id: "ss2fx-dyaaa-aaaar-qacoq-cai", label: "ckETH" },
]

/**
 * NNS governance: a canister, but not a ledger. It has no `icrc1_*` methods,
 * so the IC rejects every read of it (reject code 5). The home page renders it
 * as a fourth ledger, to show one section failing alone.
 */
export const NOT_A_LEDGER: LedgerRef = {
  id: "rrkah-fqaaa-aaaaa-aaaaq-cai",
  label: "NNS governance (not a ledger)",
}

/** The cycles minting canister: it holds ICP, so a lookup has an answer. */
export const SAMPLE_OWNER = "rkp4c-7iaaa-aaaaa-aaaca-cai"

/**
 * A well-formed canister id that names no canister on mainnet: a boundary
 * node refuses every read of it with HTTP 400 `canister_not_found`, which the
 * client reports as `code: "canister_not_found"`.
 */
export const NO_CANISTER = "2y4s5-zaaaa-aaad7-7777q-cai"
