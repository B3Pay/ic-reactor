import { icrc1SymbolQuery } from "@/canisters/ledger/hooks"

export function TokenSymbol() {
  const { data: symbol } = icrc1SymbolQuery.useQuery()
  return <span>{symbol ?? "ICP"}</span>
}
