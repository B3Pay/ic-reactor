import { createRoot } from "react-dom/client"

import App from "./App"
import { AgentProvider } from "@ic-reactor/react"

const rootElement = document.getElementById("root")
const root = createRoot(rootElement)

root.render(
  <AgentProvider>
    <App />
  </AgentProvider>
)
