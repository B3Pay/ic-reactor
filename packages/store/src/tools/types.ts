import type { AgentManager } from "../agent"
import type { IDL, HttpAgent } from "../types"

export interface CandidAdapterOptions {
  agentManager?: AgentManager
  agent?: HttpAgent
  didjsCanisterId?: string
}

export interface CandidDefenition {
  idlFactory: IDL.InterfaceFactory
  init: ({ idl }: { idl: typeof IDL }) => never[]
}
