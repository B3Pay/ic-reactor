import type { IDL, HttpAgent, AgentManager } from "@ic-reactor/core/dist/types"

export interface CandidAdapterParameters {
  agentManager?: AgentManager
  agent?: HttpAgent
  didjsCanisterId?: string
}

export interface CandidDefenition {
  idlFactory: IDL.InterfaceFactory
  init: ({ idl }: { idl: typeof IDL }) => never[]
}
