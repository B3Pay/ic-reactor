import { ActorHooks } from "./hooks"

/**
 * Hook for accessing the current state of the actor, including the canister ID.
 *
 * @returns An object containing the current state of the actor from Zustand's store and the canister ID.
 * @example
 * ```tsx
 * function ActorStateComponent() {
 *   const { canisterId, initializing, error, initialized } = useActorState();
 *
 *   return (
 *    <div>
 *     <p>Canister ID: {canisterId}</p>
 *     <p>Initializing: {initializing.toString()}</p>
 *     <p>Initialized: {initialized.toString()}</p>
 *     <p>Error: {error?.message}</p>
 *   </div>
 *   );
 * }
 *```
 */
export const useActorState = ActorHooks.useActorState
