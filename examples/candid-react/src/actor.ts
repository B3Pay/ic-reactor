import { idlFactory, candid } from "./declarations/candid"
import { createReActor } from "@ic-reactor/react"

export type CandidMethod = typeof candid

export const { useActorStore, useMethodFields, useQueryCall } =
  createReActor<CandidMethod>({
    canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
    idlFactory,
    host: "https://localhost:4943",
  })
