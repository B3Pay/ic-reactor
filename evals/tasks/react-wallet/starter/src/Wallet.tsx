import type { ReactElement } from "react"
import type { WalletAuth } from "./auth"
import type { LedgerConfig } from "./config"

export interface WalletProps {
  auth: WalletAuth
  config: LedgerConfig
}

export function Wallet(_props: WalletProps): ReactElement {
  return <p>TODO: implement the wallet</p>
}
