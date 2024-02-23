import { AgentProvider, useActor } from "@ic-reactor/react"
import { createContext } from "react"
import type { Ledger } from "../declarations/ledger"
import { extractActorContext } from "@ic-reactor/react/dist/helpers"
import { ActorHooksReturnType } from "@ic-reactor/react/dist/types"

const ActorContext = createContext<ActorHooksReturnType<Ledger> | null>(null)

export const { useLedgerQueryCall: useQueryCall, useUpdateCall } =
  extractActorContext(ActorContext)

const Reactor = () => {
  const { hooks, fetching, fetchError } = useActor<Ledger>({
    canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai", // ICP Ledger canister
  })

  return (
    <ActorContext.Provider value={hooks}>
      <h2>IC Canister Interaction</h2>
      {fetching && <p>Loading Candid interface...</p>}
      {fetchError && <p>Error: {fetchError}</p>}
      {hooks && <CanisterName />}
    </ActorContext.Provider>
  )
}

const CanisterName = () => {
  const { data } = useQueryCall({
    functionName: "name",
  })

  return (
    <div>
      <h3>Query Call</h3>
      <p>Result: {JSON.stringify(data)}</p>
    </div>
  )
}

const App = () => (
  <AgentProvider withDevtools>
    <Reactor />
  </AgentProvider>
)

export default App
