import { IDL } from "@dfinity/candid"
import { ActorHooks } from ".."
import { UseActorParameters } from "../../../types"

/**
 * Initializes an actor with the provided IDL factory and optional actor configuration.
 * This hook is used when the actor is not initialized by the `ActorProvider` component,
 * or when the actor needs to be initialized in a specific way.
 */
export function useInitializeActor(
  idlFactory: IDL.InterfaceFactory,
  actorReConfig?: UseActorParameters
) {
  return ActorHooks.useInitializeActor(idlFactory, actorReConfig)
}
