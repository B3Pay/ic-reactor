import { createReActor } from "@ic-reactor/core"
import { createActor } from "candid"

export const {
  ReActorProvider,
  useReActor,
  callActor,
  initialize,
  useActorMethodState,
  iterateActorState,
  useActorMethod,
} = createReActor(() =>
  createActor("xeka7-ryaaa-aaaal-qb57a-cai", {
    agentOptions: {
      host: "https://icp-api.io",
    },
  })
)
