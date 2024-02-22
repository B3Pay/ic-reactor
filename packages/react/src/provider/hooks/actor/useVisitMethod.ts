import { BaseActor, FunctionName } from "../../../types"
import { ActorHooks } from "../../actorHooks"

/**
 * Memoizes and returns a visit service function for a specific actor method.
 *
 * @param functionName The name of the actor method to visit.
 * @returns The visit service function for the specified method.
 */
export function useVisitMethod<A = BaseActor>(functionName: FunctionName<A>) {
  return ActorHooks.useVisitMethod(functionName)
}
