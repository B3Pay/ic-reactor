import { HttpAgent } from "@dfinity/agent"
import { createReActor } from "@ic-reactor/react"
import { createActor } from "./candid"

export const {
  ReActorProvider,
  useReActor,
  initialize,
  useActorState,
  useQueryCall,
  useUpdateCall,
  useAuthClient,
} = createReActor(
  (agent: HttpAgent) =>
    createActor("xeka7-ryaaa-aaaal-qb57a-cai", {
      agent,
    }),
  {
    host: "https://icp-api.io",
  }
)
