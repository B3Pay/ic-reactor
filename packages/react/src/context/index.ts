import { createAdapterContext } from "./adapter"
import { createActorContext } from "./actor"
import { createAgentContext } from "./agent"

export const AgentHooks = createAgentContext()
export const ActorHooks = createActorContext()
export const AdapterHooks = createAdapterContext()

export { createActorContext, createAgentContext, createAdapterContext }
