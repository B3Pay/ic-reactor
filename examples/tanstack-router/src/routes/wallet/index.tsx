import { createFileRoute } from "@tanstack/react-router"
import { useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"

export const Route = createFileRoute("/wallet/")({
  component: WalletSelection,
})

function WalletSelection() {
  const navigate = useNavigate()
  const [customId, setCustomId] = useState("")

  const tokens = [
    { name: "ICP", symbol: "ICP", id: "ryjl3-tyaaa-aaaaa-aaaba-cai" },
    { name: "ckBTC", symbol: "ckBTC", id: "mxzaz-hqaaa-aaaar-qaada-cai" },
    { name: "ckETH", symbol: "ckETH", id: "ss2fx-dyaaa-aaaar-qacoq-cai" },
    { name: "ckUSDT", symbol: "ckUSDT", id: "cngnf-vqaaa-aaaar-qag4q-cai" },
    { name: "ckUSDC", symbol: "ckUSDC", id: "xevnm-gaaaa-aaaar-qafnq-cai" },
  ]

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Select a Token</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2">
          {tokens.map((token) => (
            <Button
              key={token.id}
              variant="secondary"
              className="justify-start h-auto py-3 px-4"
              onClick={() =>
                navigate({
                  to: `/wallet/$canisterId`,
                  params: { canisterId: token.id },
                })
              }
            >
              <div className="flex flex-col items-start gap-1">
                <span className="font-semibold">{token.name}</span>
                <span className="text-xs text-gray-400">{token.id}</span>
              </div>
            </Button>
          ))}
        </div>

        <div className="border-t border-white/10 pt-4 mt-4">
          <label className="text-sm text-gray-400 block mb-2">
            Or enter Canister ID
          </label>
          <div className="flex gap-2">
            <Input
              value={customId}
              onChange={(e) => setCustomId(e.target.value)}
              placeholder="aaaaa-aa..."
            />
            <Button onClick={() => navigate({ to: `/wallet/${customId}` })}>
              Go
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
