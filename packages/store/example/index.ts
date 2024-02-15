import { createAgentManager } from "@ic-reactor/store"

const agentManager = createAgentManager({
  withDevtools: true,
  isLocalEnv: true,
  port: 8000,
})

const identity = await agentManager.authenticate()

import { createReActorStore } from "@ic-reactor/store"
import { candid, canisterId, idlFactory } from "./candid"

type Candid = typeof candid

const { callMethod } = createReActorStore<Candid>({
  agentManager,
  canisterId,
  idlFactory,
})

const data = await callMethod("version")

console.log(data)
