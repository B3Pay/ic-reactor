import ReactDOM from "react-dom/client"
import "./index.css"

import CandidViewer from "./components/CandidViewer"
import { AgentProvider } from "@ic-reactor/react"

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement)
root.render(
  <AgentProvider withDevtools>
    <CandidViewer />
  </AgentProvider>
)
