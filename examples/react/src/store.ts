import { createReActor } from "@ic-reactor/react"
import { idlFactory, backend } from "./candid"

export const { useQueryCall, useUpdateCall, useActorStore, useAuthClient } =
  createReActor<typeof backend>({
    canisterId: "xeka7-ryaaa-aaaal-qb57a-cai",
    idlFactory,
    host: "https://icp-api.io",
  })
