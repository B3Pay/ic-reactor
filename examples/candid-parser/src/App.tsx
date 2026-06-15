import { useEffect, useMemo, useRef, useState } from "react"
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

  const [methods, setMethods] = useState<string[] | null>(null)

  const [{ result, error, loading }, setState] = useState<{
    result: unknown
    error: string | null
    loading: boolean
  }>({
    result: null,
    error: null,
    loading: false,
  })

  const reactor = useMemo(
    () =>
      new CandidDisplayReactor({
        name: "Candid Display Reactor",
        canisterId,
        candid,
        clientManager,
      }),
    [canisterId, candid]
  )

  const latestFunctionName = useRef(functionName)
  latestFunctionName.current = functionName

  useEffect(() => {
    let active = true
    setMethods(null)

    reactor
      .initialize()
      .then(() => {
        if (!active) return
        const names = reactor.getMethodNames()
        setMethods(names)

        const currentName =
          names.find((n) => n === latestFunctionName.current) || names[0]
        setFunctionName(currentName || "")
      })
      .catch((err) => {
        console.error(err)
        if (active) {
          setMethods([])
          setFunctionName("")
        }
      })

    return () => {
      active = false
    }
  }, [reactor])

  const handleCall = async () => {
    setState({ result: null, error: null, loading: true })

    try {
      let args = []
      try {
        args = JSON.parse(argsInput)
        if (!Array.isArray(args)) throw new Error("Arguments must be an array")
      } catch (e) {
        throw new Error("Invalid JSON arguments: " + (e as Error).message)
      }

      console.log("Calling with:", { functionName, args, candid })

      const isQuery = reactor.isQueryMethod(functionName)
      const res = await (isQuery
        ? reactor.queryDynamic({ functionName, candid, args })
        : reactor.callDynamic({ functionName, candid, args }))

      const formattedResult =
        res === null || typeof res !== "object" || Array.isArray(res)
          ? { value: res }
          : res

      setState({ result: formattedResult, error: null, loading: false })
    } catch (err) {
      console.error(err)
      setState({
        result: null,
        error: (err as Error).message || "Unknown error",
        loading: false,
      })
    }
  }

  const isQueryMethod = reactor.isQueryMethod(functionName)

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
            <div className="input-group">
              <label>
                <span className="label-icon">⚡</span>
                Function Name
              </label>
              <select
                value={functionName}
                onChange={(e) => setFunctionName(e.target.value)}
                className="select-input method-select"
                disabled={!methods || methods.length === 0}
              >
                {!methods ? (
                  <option value="">Loading methods...</option>
                ) : methods.length > 0 ? (
                  methods.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))
                ) : (
                  <option value="">No methods found</option>
                )}
              </select>
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
            disabled={loading || !functionName || !methods}
            className={`execute-button ${loading ? "loading" : ""} ${isQueryMethod ? "" : "update-mode"}`}
          >
            {loading ? (
              <>
                <span className="spinner" />
                Executing...
              </>
            ) : (
              <>
                <span className="button-icon">
                  {isQueryMethod ? "🔍" : "✍️"}
                </span>
                Execute {isQueryMethod ? "Query" : "Update"}
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
