import { createFileRoute } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Transfer } from "@/components/transfer"
import { clientManager } from "@/client"

// Import CLI-generated hooks
import { ledgerReactor } from "@/canisters/ledger/reactor"
import {
  icrc1NameQuery,
  icrc1SymbolQuery,
  icrc1DecimalsQuery,
  icrc1BalanceOfQuery,
} from "@/canisters/ledger/hooks"

export const Route = createFileRoute("/wallet/$canisterId")({
  component: TokenWallet,
  loader: async ({ params: { canisterId } }) => {
    ledgerReactor.setCanisterId(canisterId)

    const principal = await clientManager.getUserPrincipal()
    return { principal }
  },
})

function TokenWallet() {
  const navigate = Route.useNavigate()
  const { principal } = Route.useLoaderData()

  const balanceQuery = icrc1BalanceOfQuery([{ owner: principal.toString() }])
  const { data: balance, isLoading, error, refetch } = balanceQuery.useQuery()

  // Use CLI-generated query factories
  const { data: name } = icrc1NameQuery.useQuery()
  const { data: symbol } = icrc1SymbolQuery.useQuery()
  const { data: decimals } = icrc1DecimalsQuery.useQuery()

  // Helper to refresh all queries for this canister
  const handleRefreshAll = () => {
    ledgerReactor.invalidateQueries()
  }

  // Helper to refresh just balance query
  const handleRefreshBalance = () => {
    refetch()
  }

  return (
    <div className="flex flex-col gap-2 w-full max-w-md">
      <div className="flex justify-between">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => navigate({ to: "/wallet" })}
        >
          ← Back to Tokens
        </Button>
        <Button variant="outline" size="sm" onClick={handleRefreshAll}>
          ↻ Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {typeof name === "string" ? name : "Token"} (
            {typeof symbol === "string" ? symbol : "ICP"}) Wallet
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <label className="text-sm text-gray-400 block mb-1">
              Principal ID
            </label>
            <code className="block p-3 bg-black/30 rounded text-xs font-mono break-all text-gray-300">
              {principal?.toString() || "Not authenticated"}
            </code>
          </div>

          <div>
            <div className="flex justify-between items-center">
              <label className="text-sm text-gray-400 block mb-1">
                Balance
              </label>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefreshBalance}
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
                    : balance !== undefined && decimals !== undefined
                      ? (
                          Number(balance) / Math.pow(10, Number(decimals))
                        ).toFixed(4)
                      : "0.0000"}
                </div>
              )}
              <span className="text-gray-400">
                {typeof symbol === "string" ? symbol : "ICP"}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {principal && (
        <Transfer
          reactor={ledgerReactor}
          decimals={decimals}
          invalidateQueries={balanceQuery.getQueryKey()}
        />
      )}
    </div>
  )
}
