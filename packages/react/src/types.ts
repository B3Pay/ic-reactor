import type { HttpAgent, VisitService } from "@ic-reactor/core/dist/types"
import type {
  GetActorHooks,
  GetAgentHooks,
  GetAuthHooks,
} from "./helpers/types"

export * from "@ic-reactor/core/dist/types"
export * from "./provider/types"
export * from "./helpers/types"

export interface CreateReactorReturn<A>
  extends GetActorHooks<A>,
    GetAuthHooks,
    GetAgentHooks {
  getAgent: () => HttpAgent
  getVisitFunction: () => VisitService<A>
}
