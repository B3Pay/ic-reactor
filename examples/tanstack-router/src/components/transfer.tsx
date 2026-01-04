import { useState } from "react"
import { Button } from "./ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"
import { Input } from "./ui/input"
import { isCanisterError, type DisplayReactor } from "@ic-reactor/core"
import type { Ledger } from "@/reactor"
import { TransferError } from "./transfer-error"
import type { QueryKey } from "@tanstack/react-query"
import { useReactorMutation } from "@ic-reactor/react"

export const Transfer = ({
  reactor,
  decimals,
  refetchQueries,
}: {
  reactor: DisplayReactor<Ledger>
  decimals: number | undefined
  refetchQueries?: QueryKey
}) => {
  const [to, setTo] = useState("")
  const [amount, setAmount] = useState("")
  const [result, setResult] = useState<string | null>(null)

  const {
    mutate: transfer,
    isPending,
    error,
    reset,
  } = useReactorMutation({
    reactor,
    functionName: "icrc1_transfer",
    onSuccess: (blockIndex: string) => {
      // blockIndex is typed as string (the Ok value from the canister)
      setResult(`Transfer successful! Block index: ${blockIndex}`)
      setTo("")
      setAmount("")
    },
    onError: (err: Error) => {
      // err is typed as CanisterError<TransferError> | CallError ✓
      // Error is handled by the error display below
      console.log(
        "Transfer error:",
        isCanisterError(err) ? (err as any).err._type : err
      )
    },
    refetchQueries: refetchQueries ? [refetchQueries] : undefined,
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setResult(null)
    reset() // Clear any previous errors
    if (!to || !amount) return

    if (decimals === undefined) {
      setResult("Token decimals not loaded yet")
      return
    }

    try {
      const multiplier = Math.pow(10, Number(decimals))
      const amountString = Math.floor(Number(amount) * multiplier).toString()

      transfer([{ to: { owner: to }, amount: amountString }])
    } catch (err) {
      console.error(err)
      setResult(`Invalid Principal ID or Amount: ${(err as Error).message}`)
    }
  }

  const isLoading = decimals === undefined || isPending

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
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              step="any"
            />
          </div>
          <Button type="submit" disabled={isLoading} className="w-full">
            {isLoading ? "Transferring..." : "Transfer"}
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
              <TransferError error={error as any} />
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  )
}
