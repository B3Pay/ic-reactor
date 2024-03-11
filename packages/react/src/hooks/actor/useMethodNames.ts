import { BaseActor } from "../../types"
import { ActorHooks } from "./hooks"

/**
 * Hook for accessing the method names of an actor.
 *
 * @returns An array of method names for the actor.
 */
export const useMethodNames = <A = BaseActor>() =>
  ActorHooks.useMethodNames<A>()
