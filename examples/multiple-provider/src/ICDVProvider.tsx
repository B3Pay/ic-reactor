import type { ICDV } from "./declarations/icdv"
import { createActorContext } from "@ic-reactor/react"

export const {
  ActorProvider: ICDVProvider,
  useActorState: useICDVState,
  useQueryCall: useICDVQueryCall,
  useUpdateCall: useICDVUpdateCall,
} = createActorContext<ICDV>({
  canisterId: "agtsn-xyaaa-aaaag-ak3kq-cai",
  withDevtools: true,
})
