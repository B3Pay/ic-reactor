import { BaseActor } from "../../types"
import { ActorHooks } from "./hooks"

/**
 * Hook for accessing the method attributes of an actor.
 *
 * @returns An array of method attributes for the actor.
 */
export const useMethodAttributes = <A = BaseActor>() =>
  ActorHooks.useMethodAttributes<A>()
