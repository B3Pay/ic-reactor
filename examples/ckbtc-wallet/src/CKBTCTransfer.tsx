import { useRef } from "react"
import { transferMutation } from "./reactor"

const CKBTCTransfer = () => {
  const principalRef = useRef<HTMLInputElement>(null)
  const amountRef = useRef<HTMLInputElement>(null)

  const { mutate, data, isPending, error, reset } =
    transferMutation.useMutation()

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const owner = principalRef.current?.value || ""
    const amount = amountRef.current?.value || ""

    mutate([{ to: { owner }, amount }])
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
              ✅ Transfer successful! Block: {data}
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
