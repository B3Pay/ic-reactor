import { useAgentManager } from "@ic-reactor/react"
import LedgerProvider from "./ICRC1Provider"
import ICRC1Call from "./ICRC1Call"
import { FunctionName } from "@ic-reactor/react/dist/types"
import { ICRC1 } from "./declarations/icrc1"
import { Principal } from "@dfinity/principal"
import { useRef, useState, useEffect } from "react"
import {
  IC_HOST_NETWORK_URI,
  LOCAL_HOST_NETWORK_URI,
} from "@ic-reactor/core/dist/tools"

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
  const [canisterId, setCanisterId] = useState<string>(
    "ryjl3-tyaaa-aaaaa-aaaba-cai"
  )
  const [network, setNetwork] = useState<string>("ic")
  const agentManager = useAgentManager()

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    try {
      const principal = Principal.fromText(inputRef.current?.value || "")
      setCanisterId(principal.toText())
      localStorage.setItem("dynamicCanisterId", principal.toText())
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    console.log("updating agent", network)
    agentManager.updateAgent({
      host: network === "local" ? LOCAL_HOST_NETWORK_URI : IC_HOST_NETWORK_URI,
    })
  }, [agentManager, network])

  return (
    <div>
      <h1>ICRC Token</h1>
      <form onSubmit={onSubmit}>
        <input
          id="canisterId"
          required
          ref={inputRef}
          defaultValue={canisterId}
        />
        <button type="submit">Fetch</button>
      </form>
      <select value={network} onChange={(e) => setNetwork(e.target.value)}>
        <option value="ic">IC</option>
        <option value="local">Local</option>
      </select>
      {canisterId && (
        <LedgerProvider canisterId={canisterId}>
          {functionNames.map((functionName) => (
            <ICRC1Call key={functionName} functionName={functionName} />
          ))}
        </LedgerProvider>
      )}
    </div>
  )
}

export default App
