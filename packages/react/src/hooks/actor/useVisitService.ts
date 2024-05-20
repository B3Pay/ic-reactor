import { ActorHooks } from "../../context/actor"

import type { BaseActor, UseVisitService } from "../../types"

/**
 * Memoizes and returns a visit service function for a specific actor method.
 *
 * @param functionName The name of the actor method to visit.
 * @returns The visit service function for the specified method.
 */
export function useVisitService<A = BaseActor>() {
  return (ActorHooks.useVisitService as UseVisitService<A>)()
}
