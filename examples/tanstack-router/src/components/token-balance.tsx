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
        <div className="mt-2 h-8" />
      </div>
      <div className="flex items-baseline gap-2 mt-1">
        <Skeleton className="h-9 w-40" />
        sadqw
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
    select: (balance) => {
      const decimalsNum = Number(decimals)
      // Use Number() for display precision - aware of limitation for >2^53
      const balanceNum = Number(balance)
      return balanceNum / Math.pow(10, decimalsNum)
    },
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
            {balance.toFixed(4)}
          </div>
        )}
        <TokenSymbol />
      </div>
    </>
  )
}
