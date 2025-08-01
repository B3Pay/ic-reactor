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

export type CreateReactorParameters = CreateReactorCoreParameters

export interface CreateReactorReturnType<A>
  extends ActorHooksReturnType<A>,
    AuthHooksReturnType,
    AgentHooksReturnType {
  getAgent: () => HttpAgent
  getVisitFunction: () => VisitService<A>
}

export * from "./context/actor/types"
export * from "./context/agent/types"
export * from "./context/adapter/types"

export * from "./helpers/types"
export * from "./hooks/types"

export * from "@ic-reactor/core/dist/types"
