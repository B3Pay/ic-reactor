import type { _SERVICE } from "./declarations/ckbtc"
import { createActorContext } from "@ic-reactor/react"

export const {
  ActorProvider: CKBTCLedgerProvider,
  useActorState: useCKBTCLedgerState,
  useMethod: useCKBTCLedgerMethod,
} = createActorContext<_SERVICE>({
  canisterId: "mc6ru-gyaaa-aaaar-qaaaq-cai",
  withDevtools: true,
})
