import { PropsWithChildren, createContext } from "react"
import type { ICRC1 } from "./declarations/icrc1"
import { extractActorContext } from "@ic-reactor/react/dist/helpers"
import { ActorHooksReturnType } from "@ic-reactor/react/dist/types"
import { useActor } from "@ic-reactor/react"

const ActorContext = createContext<ActorHooksReturnType<ICRC1> | null>(null)

export const {
  useQueryCall: useICRC1QueryCall,
  useUpdateCall: useICRC1UpdateCall,
} = extractActorContext(ActorContext)

interface ICRC1ActorProps extends PropsWithChildren {
  canisterId: string
}

const ICRC1Provider: React.FC<ICRC1ActorProps> = ({ children, canisterId }) => {
  const { hooks, fetching, fetchError } = useActor<ICRC1>({
    canisterId,
  })

  return (
    <ActorContext.Provider value={hooks}>
      <h2>ICRC1 Actor({canisterId})</h2>
      {fetching && <p>Loading Candid interface...</p>}
      {fetchError && <p>Error: {fetchError}</p>}
      {hooks && children}
    </ActorContext.Provider>
  )
}

export default ICRC1Provider
