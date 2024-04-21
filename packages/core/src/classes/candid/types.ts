import type { AgentManager } from "../agent"
import type { IDL, HttpAgent } from "@src/types"

export interface CandidAdapterParameters {
  agentManager?: AgentManager
  agent?: HttpAgent
  didjsCanisterId?: string
}

export interface CandidDefenition {
  idlFactory: IDL.InterfaceFactory
  init: ({ idl }: { idl: typeof IDL }) => never[]
}
