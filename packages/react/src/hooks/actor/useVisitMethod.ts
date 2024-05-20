import { ActorHooks } from "../../context/actor"

import type { BaseActor, FunctionName } from "../../types"

/**
 * Memoizes and returns a visit service function for a specific actor method.
 *
 * @param functionName The name of the actor method to visit.
 * @returns The visit service function for the specified method.
 */
export function useVisitMethod<A = BaseActor>(functionName: FunctionName<A>) {
  return ActorHooks.useVisitMethod(functionName)
}
