import type { PropsWithChildren } from "react"
import type {
  AgentHooksReturnType,
  AuthHooksReturnType,
  AgentManager,
  AgentManagerParameters,
} from "@src/types"

export interface AgentContext
  extends AgentHooksReturnType,
    AuthHooksReturnType {
  agentManager: AgentManager
}

export interface CreateAgentCotextParameters extends AgentManagerParameters {
  withProcessEnv?: boolean
  disableAuthenticateOnMount?: boolean
}

export interface CreateAgentContextReturnType
  extends AgentHooksReturnType,
    AuthHooksReturnType {
  useAgentManager: () => AgentManager
  AgentProvider: React.FC<AgentProviderProps>
}

export interface AgentProviderProps
  extends PropsWithChildren,
    CreateAgentCotextParameters {
  agentManager?: AgentManager
}
