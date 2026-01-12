import { useState } from "react"
import { ClientManager } from "@ic-reactor/core"
import ReactJson from "@microlink/react-json-view"
import { QueryClient } from "@tanstack/react-query"
import { CandidDisplayReactor } from "@ic-reactor/candid"

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
  const [callType, setCallType] = useState<
    "query" | "call" | "composite_query"
  >("query")

  const [result, setResult] = useState<unknown>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleCall = async () => {
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      // Create reactor instance with display transformations
      // CandidDisplayReactor automatically converts:
      // - bigint → string
      // - Principal → string
      // - [T] | [] → T | null
      const reactor = new CandidDisplayReactor({
        name: "Candid Display Reactor",
        canisterId,
        clientManager,
      })

      // Parse arguments (already in display format - strings for Principal/bigint)
      let args = []
      try {
        args = JSON.parse(argsInput)
        if (!Array.isArray(args)) throw new Error("Arguments must be an array")
      } catch (e) {
        throw new Error("Invalid JSON arguments: " + (e as Error).message)
      }

      console.log("Calling with:", { functionName, args, candid })

      let res
      if (callType === "query" || callType === "composite_query") {
        // Use queryDynamic for one-shot query with display transformations
        res = await reactor.queryDynamic({
          functionName,
          candid,
          args,
        })
      } else {
        // Use callDynamic for one-shot update with display transformations
        res = await reactor.callDynamic({
          functionName,
          candid,
          args,
        })
      }

      // No need for BigInt serialization - CandidDisplayReactor already converts to strings!
      // Wrap primitive values in an object for ReactJson
      // ReactJson requires a valid object, not primitives
      if (res === null || typeof res !== "object" || Array.isArray(res)) {
        setResult({ value: res })
      } else {
        setResult(res)
      }
    } catch (err) {
      console.error(err)
      setError((err as Error).message || "Unknown error")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app-wrapper">
      <div className="background-glow" />
      <div className="container">
        <header className="header">
          <div className="logo-container">
            <div className="logo-icon">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M12 2L2 7L12 12L22 7L12 2Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M2 17L12 22L22 17"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M2 12L12 17L22 12"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h1>Dynamic Candid Call</h1>
          </div>
          <p className="subtitle">
            Execute ICP canister methods dynamically using Candid interface
            definitions
          </p>
        </header>

        <div className="card">
          <div className="card-section">
            <div className="input-group">
              <label>
                <span className="label-icon">🎯</span>
                Canister ID
              </label>
              <input
                value={canisterId}
                onChange={(e) => setCanisterId(e.target.value)}
                placeholder="Enter canister ID..."
                className="input-highlight"
              />
            </div>
          </div>

          <div className="card-section">
            <div className="input-group">
              <label>
                <span className="label-icon">📜</span>
                Candid Interface
              </label>
              <textarea
                value={candid}
                onChange={(e) => setCandid(e.target.value)}
                rows={8}
                placeholder="service : { ... }"
                className="code-textarea"
              />
            </div>
          </div>

          <div className="card-section">
            <div className="row">
              <div className="input-group flex-1">
                <label>
                  <span className="label-icon">⚡</span>
                  Function Name
                </label>
                <input
                  value={functionName}
                  onChange={(e) => setFunctionName(e.target.value)}
                  placeholder="method_name"
                />
              </div>

              <div className="input-group type-select">
                <label>
                  <span className="label-icon">🔄</span>
                  Type
                </label>
                <select
                  value={callType}
                  onChange={(e) =>
                    setCallType(e.target.value as "query" | "call")
                  }
                  className="select-input"
                >
                  <option value="query">Query (Read)</option>
                  <option value="call">Call (Update)</option>
                </select>
              </div>
            </div>
          </div>

          <div className="card-section">
            <div className="input-group">
              <label>
                <span className="label-icon">📦</span>
                Arguments (JSON Array)
              </label>
              <input
                value={argsInput}
                onChange={(e) => setArgsInput(e.target.value)}
                placeholder='[{ "owner": "principal-id" }]'
                className="code-input"
              />
              <span className="input-hint">
                💡 Use proper JSON syntax with quoted keys, e.g.{" "}
                <code>
                  [{"{"} "owner": "principal-id" {"}"}]
                </code>
              </span>
            </div>
          </div>

          <button
            onClick={handleCall}
            disabled={loading}
            className={`execute-button ${loading ? "loading" : ""} ${callType === "call" ? "update-mode" : ""}`}
          >
            {loading ? (
              <>
                <span className="spinner" />
                Executing...
              </>
            ) : (
              <>
                <span className="button-icon">
                  {callType === "query" ? "🔍" : "✍️"}
                </span>
                Execute {callType === "query" ? "Query" : "Update"}
              </>
            )}
          </button>

          {error && (
            <div className="result-container error-container">
              <div className="result-header error-header">
                <span className="result-icon">❌</span>
                <h3>Error</h3>
              </div>
              <div className="error-message">{error}</div>
            </div>
          )}

          {result !== null && (
            <div className="result-container success-container">
              <div className="result-header success-header">
                <span className="result-icon">✅</span>
                <h3>Result</h3>
              </div>
              <div className="json-viewer">
                <ReactJson
                  src={result as object}
                  theme="monokai"
                  name={false}
                  displayDataTypes={false}
                  enableClipboard={true}
                  collapsed={false}
                  style={{
                    padding: "1rem",
                    borderRadius: "8px",
                    backgroundColor: "transparent",
                    fontSize: "0.9rem",
                  }}
                />
              </div>
            </div>
          )}
        </div>

        <footer className="footer">
          <p>
            Powered by <span className="highlight">@ic-reactor/candid</span>
          </p>
        </footer>
      </div>
    </div>
  )
}

export default App
