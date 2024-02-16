import type {
  ActorMethod,
  ActorSubclass,
  HttpAgentOptions,
  HttpAgent,
  Identity,
} from "@dfinity/agent"
import type { Principal } from "@dfinity/principal"
import type { IDL } from "@dfinity/candid"
import { ActorManagerOptions } from "./actor"
import { AgentManager } from "./agent"

export type {
  ActorMethod,
  HttpAgentOptions,
  ActorSubclass,
  Principal,
  HttpAgent,
  Identity,
  IDL,
}

export interface CreateReActorOptions
  extends HttpAgentOptions,
    Omit<ActorManagerOptions, "agentManager"> {
  agentManager?: AgentManager
  isLocalEnv?: boolean
  port?: number
}
