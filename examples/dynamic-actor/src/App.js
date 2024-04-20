import CanisterForm from "./CanisterForm"
import { useState } from "react"
import { ActorProvider } from "@ic-reactor/react"
import { Actor } from "./Actor"

export default function App() {
  const [canisterId, setCanisterId] = useState()

  return (
    <div className="App">
      <CanisterForm setCanisterId={setCanisterId} />
      {/* <CandidAdapterProvider> */}
      {canisterId && (
        <ActorProvider canisterId={canisterId} withDevtools>
          <Actor />
        </ActorProvider>
      )}
      {/* </CandidAdapterProvider> */}
    </div>
  )
}
