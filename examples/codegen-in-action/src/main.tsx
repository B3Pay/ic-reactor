import { StrictMode, useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import { QueryClientProvider } from "@tanstack/react-query"
import { queryClient } from "./lib/client"

// Auto-generated reactor hooks (from the Vite plugin)
import {
  useBackendQuery,
  useBackendMutation,
  useBackendMethod,
} from "./canisters-vite/backend"

import "./style.css"
import { getCanisterEnv } from "@icp-sdk/core/agent/canister-env"

function App() {
  return (
    <main>
      <h1>IC Reactor Codegen in Action</h1>
      <p>
        Run <code>npm run codegen:vite</code> and{" "}
        <code>npm run codegen:cli</code>
        to compare generated outputs.
      </p>
      <ul>
        <li>
          Vite plugin output: <code>src/canisters-vite/backend</code>
        </li>
        <li>
          CLI output: <code>src/canisters-cli/backend</code>
        </li>
      </ul>

      <CookieSection />
    </main>
  )
}

function CookieSection() {
  const [cookieString, setCookieString] = useState(
    () => document.cookie || "(no cookies)"
  )
  const icEnvRaw = cookieString
    .split("; ")
    .find((c) => c.startsWith("ic_env="))
    ?.split("=")[1]
  const icEnv = icEnvRaw ? decodeURIComponent(icEnvRaw) : "(not set)"

  // Reactor: counter (get) and update methods (inc, add)
  const { data: counter, refetch: refetchCounter } = useBackendQuery({
    functionName: "get",
  })

  const { mutate: inc } = useBackendMutation({
    functionName: "inc",
    onSuccess: () => refetchCounter(),
  })

  // Use unified method hook for update calls
  const { call: add } = useBackendMethod({
    functionName: "add",
    onSuccess: () => refetchCounter(),
  })

  useEffect(() => {
    const onFocus = () => setCookieString(document.cookie || "(no cookies)")
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [])

  return (
    <section style={{ marginTop: 24 }}>
      <h2>🔎 Dev: Cookies & Reactor</h2>
      <div style={{ marginBottom: 8 }}>
        <strong>document.cookie:</strong>
        <pre style={{ whiteSpace: "pre-wrap", margin: "8px 0" }}>
          {cookieString}
        </pre>
      </div>
      {JSON.stringify(
        getCanisterEnv({
          cookieName: "ic_env",
        })
      )}
      <div style={{ marginBottom: 8 }}>
        <strong>Decoded ic_env:</strong>
        <pre style={{ whiteSpace: "pre-wrap", margin: "8px 0" }}>{icEnv}</pre>
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
        <div>
          <strong>counter (get):</strong>
          <div style={{ fontSize: 20, marginTop: 6 }}>
            {counter ? String(counter) : "(no response)"}
          </div>
        </div>

        <div>
          <strong>inc (useBackendMethod.call):</strong>
          <div>
            <button onClick={() => inc([])} className="btn">
              Increment
            </button>
          </div>
        </div>

        <div>
          <strong>add (useBackendMethod.call):</strong>
          <div>
            <button
              onClick={async () => {
                await add(["5"])
                setCookieString(document.cookie || "(no cookies)")
              }}
              className="btn"
            >
              Add 5
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
)
