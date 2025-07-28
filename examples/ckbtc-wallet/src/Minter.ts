import type { _SERVICE } from "./declarations/minter"
import { createActorContext } from "@ic-reactor/react"

export const {
  ActorProvider: CKBTCMinterProvider,
  useActorState: useCKBTCMinterState,
  useMethod: useCKBTCMinterMethod,
  useQueryCall: useCKBTCMinterQueryCall,
} = createActorContext<_SERVICE>({
  canisterId: "ml52i-qqaaa-aaaar-qaaba-cai",
  withDevtools: true,
})
