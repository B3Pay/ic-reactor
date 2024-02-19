import { getAgentHooks } from "./agent"
import { getAuthHooks } from "./auth"

export type AgentHooks = ReturnType<typeof getAgentHooks>

export type AuthHooks = ReturnType<typeof getAuthHooks>
