import { useActorState, useMethodAttributes } from "@ic-reactor/react"
import React from "react"
import { Method } from "./Method"

let renderCounter = 1
export const Actor = () => {
  const { canisterId } = useActorState()
  const methodAttributes = useMethodAttributes()

  return (
    <div>
      <h1>Actor</h1> <p>Render count: {renderCounter++}</p>
      <p>Canister ID: {canisterId}</p>
      {Object.entries(methodAttributes).map(([functionName, attributes]) => (
        <Method
          key={functionName}
          functionName={functionName}
          {...attributes}
        />
      ))}
    </div>
  )
}
