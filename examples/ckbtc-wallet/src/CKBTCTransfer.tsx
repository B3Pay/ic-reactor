import { Principal } from "@icp-sdk/core/principal"
import { useRef } from "react"
import { transferMutation } from "./reactor"

const CKBTCTransfer = () => {
  const principalRef = useRef<HTMLInputElement>(null)
  const amountRef = useRef<HTMLInputElement>(null)

  const { mutate, data, isPending, error, reset } =
    transferMutation.useMutation()

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const principal = principalRef.current?.value || ""
    const amount = amountRef.current?.value || ""

    mutate([
      {
        to: {
          owner: Principal.fromText(principal),
          subaccount: [],
        },
        amount: BigInt(amount),
        fee: [],
        memo: [],
        created_at_time: [],
        from_subaccount: [],
      },
    ])
  }

  // Helper to format result for display
  const formatResult = (result: unknown): string => {
    if (result === null || result === undefined) return ""
    if (typeof result === "bigint") return result.toString()
    if (typeof result === "object") {
      return JSON.stringify(result, (_, v) =>
        typeof v === "bigint" ? v.toString() : v
      )
    }
    return String(result)
  }

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-icon">💸</span>
        <h3 className="card-title">Transfer ckBTC</h3>
      </div>

      <form onSubmit={onSubmit}>
        <div className="form-group">
          <label className="form-label">Recipient Principal</label>
          <input
            type="text"
            name="principal"
            ref={principalRef}
            placeholder="aaaaa-aa..."
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label">Amount (in smallest unit)</label>
          <input
            type="text"
            name="amount"
            ref={amountRef}
            placeholder="100000000"
            required
          />
        </div>

        <button
          type="submit"
          className="btn-primary"
          disabled={isPending}
          style={{ width: "100%", padding: "12px" }}
        >
          {isPending ? (
            <>
              <span className="spinner" style={{ marginRight: "8px" }} />
              Sending...
            </>
          ) : (
            "Send ckBTC"
          )}
        </button>
      </form>

      {/* Result Display */}
      {(data || error) && (
        <div style={{ marginTop: "16px" }}>
          {error ? (
            <div className="status status-error">⚠️ {error.message}</div>
          ) : data ? (
            <div className="status status-success">
              ✅ Transfer successful! Block: {formatResult(data)}
              <button
                className="btn-icon"
                onClick={() => reset()}
                style={{ marginLeft: "auto", fontSize: "0.75rem" }}
              >
                ✕
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

export default CKBTCTransfer
