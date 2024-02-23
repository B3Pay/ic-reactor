import { useAgentManager, useUserPrincipal } from "@ic-reactor/react"
import LedgerProvider from "./ICRC1Provider"
import ICRC1Call from "./ICRC1Call"
import { FunctionName } from "@ic-reactor/react/dist/types"
import { ICRC1 } from "./declarations/icrc1"
import { Principal } from "@dfinity/principal"
import { useRef, useState } from "react"
import {
  IC_HOST_NETWORK_URI,
  LOCAL_HOST_NETWORK_URI,
} from "@ic-reactor/core/dist/utils"
import UserWallet from "./UserWallet"
import Login from "./Login"

interface AppProps {}

const functionNames: FunctionName<ICRC1>[] = [
  "icrc1_name",
  "icrc1_symbol",
  "icrc1_fee",
  "icrc1_decimals",
  "icrc1_metadata",
  "icrc1_total_supply",
  "icrc1_minting_account",
]

const App: React.FC<AppProps> = () => {
  const inputRef = useRef<HTMLInputElement>(null)
  const networkRef = useRef<HTMLSelectElement>(null)
  const [canisterId, setCanisterId] = useState<string>(
    "ryjl3-tyaaa-aaaaa-aaaba-cai"
  )

  const { updateAgent } = useAgentManager()

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    try {
      const principal = Principal.fromText(inputRef.current?.value || "")
      console.log(networkRef.current?.value)

      updateAgent({
        host:
          networkRef.current?.value === "local"
            ? LOCAL_HOST_NETWORK_URI
            : IC_HOST_NETWORK_URI,
      })
      setCanisterId(principal.toText())
    } catch (e) {
      console.error(e)
    }
  }

  const principal = useUserPrincipal()

  return (
    <div>
      <h1>ICRC Token</h1>
      <Login />
      <form onSubmit={onSubmit}>
        <select ref={networkRef}>
          <option value="ic">IC</option>
          <option value="local">Local</option>
        </select>
        <input
          id="canisterId"
          required
          ref={inputRef}
          defaultValue={canisterId}
        />
        <button type="submit">Fetch</button>
      </form>
      <LedgerProvider canisterId={canisterId}>
        {functionNames.map((functionName) => (
          <ICRC1Call key={functionName} functionName={functionName} />
        ))}
        {principal && <UserWallet principal={principal} />}
      </LedgerProvider>
    </div>
  )
}

export default App
