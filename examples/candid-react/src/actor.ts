import { idlFactory, candid } from "./declarations/candid"
import { createReActor } from "@ic-reactor/react"

export type CandidType = typeof candid

export const {
  getAgent,
  getServiceFields,
  useActorStore,
  useMethodFields,
  useMethodDetails,
  useQueryCall,
  useMethodCall,
} = createReActor<CandidType>({
  canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
  idlFactory,
  withServiceFields: true,
  host: "https://localhost:4943",
})
