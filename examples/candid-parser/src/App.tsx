import { useState } from "react"
import { CandidReactor } from "@ic-reactor/candid"
import { ClientManager } from "@ic-reactor/core"
import ReactJson from "@microlink/react-json-view"
import { QueryClient } from "@tanstack/react-query"

// Initialize basic client manager
const clientManager = new ClientManager({
  queryClient: new QueryClient(),
})

const DEFAULT_CANISTER_ID = "ryjl3-tyaaa-aaaaa-aaaba-cai" // ICP Ledger
const DEFAULT_CANDID = `service : {
  icrc1_name : () -> (text) query;
  icrc1_symbol : () -> (text) query;
  icrc1_balance_of : (record { owner : principal }) -> (nat) query;
}`
const DEFAULT_FUNC = "icrc1_name"
const DEFAULT_ARGS = "[]"

function App() {
  const [canisterId, setCanisterId] = useState(DEFAULT_CANISTER_ID)
  const [candid, setCandid] = useState(DEFAULT_CANDID)
  const [functionName, setFunctionName] = useState(DEFAULT_FUNC)
  const [argsInput, setArgsInput] = useState(DEFAULT_ARGS)
  const [callType, setCallType] = useState<"query" | "call">("query")

  const [result, setResult] = useState<unknown>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleCall = async () => {
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      // Create reactor instance
      const reactor = new CandidReactor({
        canisterId,
        clientManager,
      })

      // Parse arguments
      let args = []
      try {
        args = JSON.parse(argsInput)
        if (!Array.isArray(args)) throw new Error("Arguments must be an array")
      } catch (e) {
        throw new Error("Invalid JSON arguments: " + (e as Error).message)
      }

      console.log("Calling with:", { functionName, args, candid })

      let res
      if (callType === "query") {
        // Use queryDynamic for one-shot query
        res = await reactor.queryDynamic({
          functionName,
          candid,
          args,
        })
      } else {
        // Use callDynamic for one-shot update
        res = await reactor.callDynamic({
          functionName,
          candid,
          args,
        })
      }

      // Handle BigInt serialization for display
      const serializableRes = JSON.parse(
        JSON.stringify(res, (_, v) =>
          typeof v === "bigint" ? v.toString() + "n" : v
        )
      )

      setResult(serializableRes)
    } catch (err) {
      console.error(err)
      setError((err as Error).message || "Unknown error")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container">
      <h1>Dynamic Candid Call</h1>

      <div className="card">
        <div className="input-group">
          <label>Canister ID</label>
          <input
            value={canisterId}
            onChange={(e) => setCanisterId(e.target.value)}
            placeholder="Canister ID"
          />
        </div>

        <div className="input-group">
          <label>Candid Interface (String)</label>
          <textarea
            value={candid}
            onChange={(e) => setCandid(e.target.value)}
            rows={10}
            placeholder="service : { ... }"
          />
        </div>

        <div className="row">
          <div className="input-group" style={{ flex: 1, marginRight: "1rem" }}>
            <label>Function Name</label>
            <input
              value={functionName}
              onChange={(e) => setFunctionName(e.target.value)}
              placeholder="method_name"
            />
          </div>

          <div className="input-group" style={{ width: "150px" }}>
            <label>Type</label>
            <select
              value={callType}
              onChange={(e) => setCallType(e.target.value as any)}
              style={{ width: "100%", padding: "0.5rem" }}
            >
              <option value="query">Query</option>
              <option value="call">Call (Update)</option>
            </select>
          </div>
        </div>

        <div className="input-group">
          <label>Arguments (JSON Array)</label>
          <input
            value={argsInput}
            onChange={(e) => setArgsInput(e.target.value)}
            placeholder="[]"
          />
        </div>

        <button onClick={handleCall} disabled={loading}>
          {loading ? "Calling..." : `Execute ${callType}`}
        </button>

        {error && (
          <div
            style={{ marginTop: "1rem", color: "#ff6b6b", textAlign: "left" }}
          >
            <strong>Error:</strong> {error}
          </div>
        )}

        {result !== null && (
          <div style={{ marginTop: "2rem", textAlign: "left" }}>
            <h3>Result:</h3>
            <ReactJson
              src={result as object}
              theme="monokai"
              name={false}
              displayDataTypes={false}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default App
