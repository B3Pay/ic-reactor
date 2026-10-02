import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { MAINNET_ICP_LEDGER } from "./config"
import { createInternetIdentityAuth } from "./ii-auth"
import { Wallet } from "./Wallet"

const auth = await createInternetIdentityAuth()
const root = document.getElementById("root")
if (root) {
  createRoot(root).render(
    <StrictMode>
      <Wallet auth={auth} config={MAINNET_ICP_LEDGER} />
    </StrictMode>
  )
}
