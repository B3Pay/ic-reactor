import { idlFactory, candid } from "./declarations/candid"
import { createReActor } from "@ic-reactor/react"
import { ActorMethodField } from "@ic-reactor/store"

export type CandidMethod = typeof candid
export type DynamicField = ActorMethodField<CandidMethod>

export const { useActorStore, useMethodFields, useQueryCall } =
  createReActor<CandidMethod>({
    canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
    idlFactory,
    host: "https://localhost:4943",
  })
