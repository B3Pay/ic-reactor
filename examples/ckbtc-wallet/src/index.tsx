import ReactDOM from "react-dom/client"
import "./index.css"

import App from "./App"
import { AgentProvider, CandidAdapterProvider } from "@ic-reactor/react"
import { CKBTCLedgerProvider } from "./CKBTC"
import { CKBTCMinterProvider } from "./Minter"

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement)
root.render(
  <AgentProvider withDevtools>
    <CandidAdapterProvider>
      <CKBTCLedgerProvider>
        <CKBTCMinterProvider>
          <App />
        </CKBTCMinterProvider>
      </CKBTCLedgerProvider>
    </CandidAdapterProvider>
  </AgentProvider>
)
