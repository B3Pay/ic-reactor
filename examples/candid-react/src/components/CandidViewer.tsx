import { extractActorHooks, useReactor } from "@ic-reactor/react"
import { ActorContextType } from "@ic-reactor/react/dist/types"
import { createContext } from "react"

const ActorContext = createContext<ActorContextType | null>(null)

const CandidViewer = () => {
  const { hooks, fetching, fetchError } = useReactor({
    canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
  })

  return (
    <ActorContext.Provider value={hooks as ActorContextType}>
      <h2>IC Canister Interaction</h2>
      {fetching && <p>Loading Candid interface...</p>}
      {fetchError && <p>Error: {fetchError}</p>}
      {hooks && <CanisterName />}
    </ActorContext.Provider>
  )
}

const { useQueryCall } = extractActorHooks(ActorContext)

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

export default CandidViewer
