import ReactDOM from "react-dom/client"
import "./index.css"

import App from "./App"
import { AgentProvider } from "@ic-reactor/react"

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement)
root.render(
  <AgentProvider withDevtools>
    <App />
  </AgentProvider>
)
