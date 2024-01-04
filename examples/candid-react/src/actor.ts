import { idlFactory, candid } from "./declarations/candid"
import { createReActor } from "@ic-reactor/react"
import { ReActorMethodField } from "@ic-reactor/store"

export type CandidMethod = typeof candid
export type DynamicField = ReActorMethodField<CandidMethod>

export const { useActorStore, useQueryCall } = createReActor<CandidMethod>({
  canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
  idlFactory,
  host: "https://localhost:4943",
})
