import type { ICRC2 } from "./declarations/icrc2"
import { createActorContext } from "@ic-reactor/react"

export const {
  ActorProvider: ICPProvider,
  useActorState: useICPState,
  useMethod: useICPMethod,
  useQueryCall: useICPQueryCall,
  useUpdateCall: useICPUpdateCall,
} = createActorContext<ICRC2>({
  canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
  withDevtools: true,
})
