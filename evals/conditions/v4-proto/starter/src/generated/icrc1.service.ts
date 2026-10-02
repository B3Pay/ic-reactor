// The ledger's typed service descriptor for @ic-reactor/v4-proto: the
// generated actor type plus each method's mode, checked against the
// generated schema when this module loads. Do not edit; import
// `LedgerService` from here.
import { defineService } from "@ic-reactor/v4-proto"
import { actor, type Actor } from "./icrc1"

export const LedgerService = defineService<Actor>()(actor, {
  icrc1_balance_of: "query",
  icrc1_decimals: "query",
  icrc1_fee: "query",
  icrc1_metadata: "query",
  icrc1_minting_account: "query",
  icrc1_name: "query",
  icrc1_supported_standards: "query",
  icrc1_symbol: "query",
  icrc1_total_supply: "query",
  icrc1_transfer: "update",
})
