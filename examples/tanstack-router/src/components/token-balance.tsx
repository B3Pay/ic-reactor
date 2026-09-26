import { formatTokenAmount } from "@ic-reactor/react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  icrc1DecimalsSuspenseQuery,
  icrc1BalanceOfSuspenseQuery,
} from "@/canisters/ledger/hooks"
import { TokenSymbol, TokenSymbolSkeleton } from "./token-symbol"

export function TokenBalanceSkeleton() {
  return (
    <>
      <div className="flex justify-between items-center">
        <label className="text-sm text-gray-400 block mb-1">Balance</label>
        <Skeleton className="mt-2 h-5 w-28" />
      </div>
      <div className="flex items-baseline gap-2">
        <Skeleton className="h-8 w-26" />
        <TokenSymbolSkeleton />
      </div>
    </>
  )
}

export function TokenBalance({ owner }: { owner: string }) {
  const { data: decimals } = icrc1DecimalsSuspenseQuery.useSuspenseQuery()
  const {
    data: balance,
    error,
    refetch,
    isFetching,
  } = icrc1BalanceOfSuspenseQuery([{ owner }]).useSuspenseQuery({
    // The balance is e8s as text. formatTokenAmount shifts the decimal point
    // on the digits, exact at any size, and cuts to four places rather than
    // rounding up past what the account holds.
    select: (balance) =>
      formatTokenAmount(balance, decimals, {
        minFractionDigits: 4,
        maxFractionDigits: 4,
      }),
  })

  return (
    <>
      <div className="flex justify-between items-center">
        <label className="text-sm text-gray-400 block mb-1">Balance</label>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          className="mt-2 h-auto text-blue-300 hover:text-blue-200"
          disabled={isFetching}
        >
          Refresh Balance
        </Button>
      </div>
      <div className="flex items-baseline gap-2">
        {error ? (
          <div className="text-red-400">Error: {error.message}</div>
        ) : (
          <div className="text-3xl font-bold text-transparent bg-clip-text bg-linear-to-r from-blue-400 to-purple-400">
            {balance}
          </div>
        )}
        <TokenSymbol />
      </div>
    </>
  )
}
