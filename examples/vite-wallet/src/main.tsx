import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App.tsx"
import { createDevAccounts } from "./auth/dev-accounts.ts"
import { isLocalPage } from "./auth/local-page.ts"
import "./styles.css"

// The dev account keeps a key any script on the page can read: offered on a
// local page only, never on a deployed one.
const devAccounts = isLocalPage(window.location)
  ? createDevAccounts(window.sessionStorage)
  : undefined

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App devAccounts={devAccounts} />
  </StrictMode>
)
