import type {
  HttpAgent,
  ReactorCoreParameters,
  VisitService,
} from "@ic-reactor/core/dist/types"
import type {
  ActorHooksReturnType,
  AgentHooksReturnType,
  AuthHooksReturnType,
} from "./helpers/types"

export interface ReactorParameters extends ReactorCoreParameters {}

export interface ReactorReturnType<A>
  extends ActorHooksReturnType<A>,
    AuthHooksReturnType,
    AgentHooksReturnType {
  getAgent: () => HttpAgent
  getVisitFunction: () => VisitService<A>
}

export * from "./provider/types"
export * from "./helpers/types"

export * from "@ic-reactor/core/dist/types"
