import { icrc1SymbolQuery } from "@/canisters/ledger/hooks"
import { Skeleton } from "./ui/skeleton"

export function TokenSymbolSkeleton() {
  return <Skeleton className="w-8 h-4" />
}

export function TokenSymbol() {
  const { data: symbol } = icrc1SymbolQuery.useQuery()
  return <span>{symbol ?? "ICP"}</span>
}
