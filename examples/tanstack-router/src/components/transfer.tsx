import { useState } from "react"
import { isPrincipalText, parseTokenAmount } from "@ic-reactor/react"
import { Button } from "./ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"
import { Input } from "./ui/input"
import { TransferError } from "./transfer-error"
import {
  icrc1DecimalsSuspenseQuery,
  useIcrc1TransferMutation,
} from "@/canisters/ledger/hooks"

export function Transfer() {
  const { data: decimals } = icrc1DecimalsSuspenseQuery.useSuspenseQuery()
  const [to, setTo] = useState("")
  const [amount, setAmount] = useState("")
  const [result, setResult] = useState<string | null>(null)

  const {
    mutate: transfer,
    isPending,
    error,
    reset,
  } = useIcrc1TransferMutation({
    // The mutation factory has already refetched the balances by now: it
    // lists icrc1BalanceOfSuspenseQuery in its invalidateQueries.
    onSuccess: (blockIndex) => {
      // blockIndex is the Ok value from the canister
      setResult(`Transfer successful! Block index: ${String(blockIndex)}`)
      setTo("")
      setAmount("")
    },
    onCanisterError: (err) => {
      // err is typed as CanisterError<TransferError> | CallError ✓
      // Error is handled by the error display below
      console.log("Transfer error:", err.err._type)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setResult(null)
    reset() // Clear any previous errors
    if (!to || !amount) return

    const owner = to.trim()
    if (!isPrincipalText(owner)) {
      setResult("Invalid Principal ID")
      return
    }

    try {
      // Exact decimal arithmetic: "0.29" at 8 decimals is 29000000 e8s, where
      // Math.floor(Number("0.29") * 10 ** 8) gives 28999999. Text with more
      // fraction digits than the token has is refused, not rounded.
      const units = parseTokenAmount(amount, decimals)
      // The DisplayReactor takes a nat as its decimal text.
      transfer([{ to: { owner }, amount: units.toString() }])
    } catch (err) {
      setResult(`Invalid Amount: ${(err as Error).message}`)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Transfer Token</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm text-gray-400 block mb-1">
              To Principal
            </label>
            <Input
              type="text"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="aaaaa-aa..."
            />
          </div>
          <div>
            <label className="text-sm text-gray-400 block mb-1">Amount</label>
            <Input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <Button type="submit" disabled={isPending} className="w-full">
            {isPending ? "Transferring..." : "Transfer"}
          </Button>

          {/* Success Message */}
          {result && (
            <div
              className={`p-3 rounded text-sm break-all ${
                result.includes("successful")
                  ? "bg-green-500/10 text-green-400 border border-green-500/20"
                  : "bg-red-500/10 text-red-400 border border-red-500/20"
              }`}
            >
              {result}
            </div>
          )}

          {/* Error Display with Type-Safe Rendering */}
          {error && (
            <div className="p-3 bg-red-500/10 text-red-400 rounded border border-red-500/20">
              <TransferError error={error} />
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  )
}

export function TransferSkeleton() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Transfer Token</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={() => {}} className="space-y-4">
          <div>
            <label className="text-sm text-gray-400 block mb-1">
              To Principal
            </label>
            <Input
              type="text"
              value=""
              onChange={() => {}}
              placeholder="aaaaa-aa..."
            />
          </div>
          <div>
            <label className="text-sm text-gray-400 block mb-1">Amount</label>
            <Input
              type="text"
              inputMode="decimal"
              value=""
              onChange={() => {}}
              placeholder="0.00"
            />
          </div>
          <Button type="submit" disabled={true} className="w-full">
            Transfer
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
