import { icrc1NameQuery } from "@/canisters/ledger/hooks"

export function TokenName() {
  const { data: name } = icrc1NameQuery.useQuery()
  return <span>{name ?? "Token"}</span>
}
