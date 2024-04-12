import type { ICRC2 } from "./declarations/icrc2"
import { createActorContext } from "@ic-reactor/react"

export const {
  ActorProvider: ICRC2Provider,
  useActorState: useICRC2State,
  useQueryCall: useICRC2QueryCall,
  useUpdateCall: useICRC2UpdateCall,
} = createActorContext<ICRC2>({
  canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
  withDevtools: true,
})
