import { createReactor } from "@ic-reactor/svelte"
import { idlFactory } from "./candid"

export const { actions, initializeActor, queryCall, updateCall } =
  createReactor<import("./candid/candid.did")._SERVICE>({
    canisterId: "xeka7-ryaaa-aaaal-qb57a-cai",
    options: { agentOptions: { host: "https://icp-api.io" } },
    idlFactory: idlFactory,
  })
