import type {
  HttpAgent,
  CreateReactorCoreParameters,
  VisitService,
} from "@ic-reactor/core/dist/types"
import type {
  ActorHooksReturnType,
  AgentHooksReturnType,
  AuthHooksReturnType,
} from "./helpers/types"

export interface CreateReactorParameters extends CreateReactorCoreParameters {}

export interface CreateReactorReturnType<A>
  extends ActorHooksReturnType<A>,
    AuthHooksReturnType,
    AgentHooksReturnType {
  getAgent: () => HttpAgent
  getVisitFunction: () => VisitService<A>
}

export * from "./provider/types"
export * from "./helpers/types"

export * from "@ic-reactor/core/dist/types"
