import { ActorHooks } from "../../context"

import type { BaseActor } from "../../types"

/**
 * Hook for accessing the method names of an actor.
 *
 * @returns An array of method names for the actor.
 */
export const useMethodNames = <A = BaseActor>() =>
  ActorHooks.useMethodNames<A>()
