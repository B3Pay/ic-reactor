import type {
  BaseActor,
  CreateReactorOptions,
  HttpAgent,
  VisitService,
} from "@ic-reactor/core/dist/types"
import type { ActorHooks, AgentHooks, AuthHooks } from "./helpers/types"

export * from "@ic-reactor/core/dist/types"
export * from "./provider/agent/types"
export * from "./provider/actor/types"
export * from "./helpers/types"

export type CreateReactor = <A = BaseActor>(
  options: CreateReactorOptions
) => CreateReactorReturn<A>

export interface CreateReactorReturn<A>
  extends ActorHooks<A>,
    AuthHooks,
    AgentHooks {
  getAgent: () => HttpAgent
  getVisitFunction: () => VisitService<A>
}
