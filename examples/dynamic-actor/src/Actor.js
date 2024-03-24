import { useActorState } from "@ic-reactor/react"
import React from "react"

export const Actor = () => {
  const { canisterId, initialized } = useActorState()
  return (
    <div>
      <h1>Actor</h1>
      <p>Canister ID: {canisterId}</p>
      <p>Initialized: {initialized ? "Yes" : "No"}</p>
    </div>
  )
}
