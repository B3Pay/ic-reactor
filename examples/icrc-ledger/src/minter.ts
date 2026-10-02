// The ckBTC minter. Its get_btc_address is an update method (it runs through
// consensus, and needs a caller that signs), yet it answers the same address
// for an account however often it runs: an update read as a query, through
// `client.queryOptions(minter, "get_btc_address", arg, { update: "idempotent" })`.
import type { Canister, Client } from "@ic-reactor/core"
import { actor, type Actor } from "./canisters/ckbtc_minter.ts"

/** The ckBTC minter's canister id on mainnet. */
export const CKBTC_MINTER = "mqygn-kiaaa-aaaar-qaadq-cai"

/** The ckBTC minter, typed with its deposit-address method (ckbtc_minter.did). */
export type Minter = Canister<Actor>

/** The ckBTC minter on `client`. */
export const minterOn = (client: Client): Minter =>
  client.canister<Actor>(actor, { id: CKBTC_MINTER })
