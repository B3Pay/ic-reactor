import { ExtractedService } from "@ic-reactor/react/dist/types"
import { idlFactory, candid } from "./declarations/candid"
import { createReActor } from "@ic-reactor/react"

export type CandidMethod = typeof candid
export type DynamicField = ExtractedService<CandidMethod>

export const { useActorStore, useMethodFields, useQueryCall } =
  createReActor<CandidMethod>({
    canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
    idlFactory,
    host: "https://localhost:4943",
  })
