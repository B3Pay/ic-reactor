import { Actor, HttpAgent } from "@dfinity/agent"
import { idlFactory } from "./hello.did.js"

export { idlFactory } from "./hello.did.js"

export const canisterId =
  process.env.CANISTER_ID_HELLO || process.env.HELLO_CANISTER_ID

export const createActor = (canisterId, options = {}) => {
  const agent = options.agent || new HttpAgent({ ...options.agentOptions })

  if (options.agent && options.agentOptions) {
    console.warn(
      "Detected both agent and agentOptions passed to createActor. Ignoring agentOptions and proceeding with the provided agent."
    )
  }

  if (process.env.DFX_NETWORK !== "ic") {
    agent.fetchRootKey().catch((err) => {
      console.warn(
        "Unable to fetch root key. Check to ensure that your local replica is running"
      )
      console.error(err)
    })
  }

  return Actor.createActor(idlFactory, {
    agent,
    canisterId,
    ...options.actorOptions,
  })
}
