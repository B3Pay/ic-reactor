import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import {
  icrc1NameQuery,
  icrc1SymbolQuery,
  icrc1DecimalsSuspenseQuery,
  icrc1BalanceOfQuery,
} from "@/canisters/ledger/hooks"
import { Principal } from "@icp-sdk/core/principal"
import { Transfer } from "./transfer"

// ----------------------------------------------------------------------------
// Display Components
// ----------------------------------------------------------------------------

export function TokenName() {
  const { data: name } = icrc1NameQuery.useQuery()
  return <span>{name ?? "Token"}</span>
}

export function TokenSymbol() {
  const { data: symbol } = icrc1SymbolQuery.useQuery()
  return <span>{symbol ?? "ICP"}</span>
}

export function TokenDecimals() {
  const { data: decimals } = icrc1DecimalsSuspenseQuery.useSuspenseQuery()
  return <span>Decimals: {decimals}</span>
}

export function TokenDecimalsSkeleton() {
  return <Skeleton className="h-6 w-24 inline-block" />
}

// ----------------------------------------------------------------------------
// Logic Components (Suspended)
// ----------------------------------------------------------------------------

export function TokenBalance({ principal }: { principal: any }) {
  const { data: decimals } = icrc1DecimalsSuspenseQuery.useSuspenseQuery()
  const {
    data: balance,
    isLoading,
    error,
    refetch,
  } = icrc1BalanceOfQuery([{ owner: principal, subaccount: [] }]).useQuery()

  return (
    <>
      <div className="flex justify-between items-center">
        <label className="text-sm text-gray-400 block mb-1">Balance</label>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          className="mt-2 h-auto text-blue-300 hover:text-blue-200"
          disabled={isLoading}
        >
          Refresh Balance
        </Button>
      </div>
      <div className="flex items-baseline gap-2">
        {error ? (
          <div className="text-red-400">Error: {error.message}</div>
        ) : (
          <div className="text-3xl font-bold text-transparent bg-clip-text bg-linear-to-r from-blue-400 to-purple-400">
            {isLoading
              ? "Loading..."
              : balance !== undefined
                ? (Number(balance) / Math.pow(10, Number(decimals))).toFixed(4)
                : "0.0000"}
          </div>
        )}
        <span className="text-gray-400">
          <TokenSymbol />
        </span>
      </div>
    </>
  )
}

export function TokenTransfer({ principal }: { principal: Principal }) {
  const { data: decimals } = icrc1DecimalsSuspenseQuery.useSuspenseQuery()
  const balanceQuery = icrc1BalanceOfQuery([{ owner: principal.toString() }])

  return (
    <Transfer
      decimals={Number(decimals)}
      invalidateQueries={balanceQuery.getQueryKey()}
    />
  )
}
