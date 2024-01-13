import { idlFactory, candid } from "./declarations/candid"
import { createReActor } from "@ic-reactor/react"

export type CandidType = typeof candid

export const {
  useActorStore,
  useMethodFields,
  useMethodNames,
  useQueryCall,
  useMethodCall,
} = createReActor<CandidType>({
  canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
  idlFactory,
})
