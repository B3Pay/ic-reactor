import type { AgentManager } from "../agent"
import type { IDL, HttpAgent } from "../../types"

export interface CandidAdapterParameters {
  agentManager?: AgentManager
  agent?: HttpAgent
  didjsCanisterId?: string
}

export interface CandidDefenition {
  idlFactory: IDL.InterfaceFactory
  init: ({ idl }: { idl: typeof IDL }) => never[]
}

export type ReactorParser =
  | typeof import("@ic-reactor/parser")
  | typeof import("@ic-reactor/parser/dist/node")
  | typeof import("@ic-reactor/parser/dist/bundler")
