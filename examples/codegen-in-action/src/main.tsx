import { StrictMode, useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import { QueryClientProvider } from "@tanstack/react-query"
import { queryClient } from "./lib/client"

// Auto-generated reactor hooks (from the Vite plugin)
import { useBackendQuery, useBackendMethod } from "./canisters-vite/backend"

import "./style.css"

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

  // Reactor: greet (query) and list_messages (query)
  const { data: greet } = useBackendQuery({
    functionName: "get",
    args: [],
  })
  const { data: messages, refetch: refetchMessages } = useBackendQuery({
    functionName: "list_messages",
  })

  // Manual method call example using useActorMethod-style hook
  const greetMethod = useBackendMethod({ functionName: "greet" })

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
      <div style={{ marginBottom: 8 }}>
        <strong>Decoded ic_env:</strong>
        <pre style={{ whiteSpace: "pre-wrap", margin: "8px 0" }}>{icEnv}</pre>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <div>
          <strong>greet (auto query):</strong>
          <div>{greet ?? "(no response)"}</div>
        </div>

        <div>
          <strong>greet (useBackendMethod.call):</strong>
          <div>
            <button
              onClick={async () => {
                const res = await greetMethod.call(["Manual call"])
                // ensure any cookie changes are reflected
                setCookieString(document.cookie || "(no cookies)")
                void res
              }}
              className="btn"
            >
              Call greet()
            </button>
          </div>
        </div>

        <div>
          <strong>list_messages:</strong>
          <div style={{ maxWidth: 420 }}>
            {JSON.stringify(messages ?? [], null, 2)}
          </div>
          <div>
            <button
              onClick={() => refetchMessages()}
              className="btn"
              style={{ marginTop: 8 }}
            >
              Refresh messages
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
