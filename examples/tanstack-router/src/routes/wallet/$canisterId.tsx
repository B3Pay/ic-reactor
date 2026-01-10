import { createFileRoute } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useUserPrincipal } from "@/lib/client"
import { ledgerReactor } from "@/canisters/ledger/reactor"
import {
  TokenBalance,
  TokenDecimalsSkeleton,
  TokenName,
  TokenSymbol,
  TokenTransfer,
} from "@/components/token-info"
import { Suspense } from "react"

export const Route = createFileRoute("/wallet/$canisterId")({
  component: TokenWallet,
  loader: async ({ params: { canisterId } }) => {
    ledgerReactor.setCanisterId(canisterId)
  },
})

function TokenWallet() {
  const navigate = Route.useNavigate()
  const principal = useUserPrincipal()

  // Helper to refresh all queries for this canister
  const handleRefreshAll = () => {
    ledgerReactor.invalidateQueries()
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
            <div className="flex items-center gap-1">
              <TokenName /> (<TokenSymbol />) Wallet
            </div>
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
            <Suspense fallback={<TokenDecimalsSkeleton />}>
              <TokenBalance principal={principal} />
            </Suspense>
          </div>
        </CardContent>
      </Card>

      {principal && (
        <Suspense fallback={null}>
          <TokenTransfer principal={principal} />
        </Suspense>
      )}
    </div>
  )
}
