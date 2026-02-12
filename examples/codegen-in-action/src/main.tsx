import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { QueryClientProvider } from "@tanstack/react-query"
import { queryClient } from "./lib/client"

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
    </main>
  )
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
)
