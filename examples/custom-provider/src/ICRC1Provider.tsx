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
  const { hooks, isFetching, fetchError } = useActor<ICRC1>({
    canisterId,
    withDevtools: true,
  })

  return (
    <ActorContext.Provider value={hooks}>
      <h2>ICRC1({canisterId})</h2>
      {isFetching && <p>Loading Candid interface...</p>}
      {fetchError && <p>Error: {fetchError}</p>}
      {hooks && children}
    </ActorContext.Provider>
  )
}

ICRC1Provider.displayName = "ICRC1Provider"

export default ICRC1Provider
