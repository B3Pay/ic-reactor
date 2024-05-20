import { ActorHooks } from ".."

/**
 * Provides a hook for accessing the state of an actor from the actor's store.
 * This hook is part of a set of utilities that facilitate interactions with
 * Internet Computer (IC) canisters by abstracting the complexities associated
 * with actor management and state retrieval.
 *
 * The `useActorStore` hook allows components to subscribe to and retrieve state
 * from the actor store in a reactive way. This enables components to re-render
 * when specific parts of the actor state change, which is managed by a selector function.
 *
 * @template A The type of the actor, extending from a base actor structure.
 * @template T The type of the data selected from the actor's state.
 * @param {Function} [selector=(s: ActorState<A>) => s as T] A function that
 *        selects a part of the actor state. This function should accept the actor state
 *        and return a portion of the state. If no selector is provided, the entire
 *        state is returned.
 *
 * @returns {T} The selected state from the actor store. The nature of the returned
 *         state depends on the selector function provided.
 *
 * @example
 * ```tsx
 * // Assuming a 'LedgerActor' has been setup and used to manage the actor store
 * const name = useActorStore(state => state.name);
 *
 * return <div>Canister Name: {name}</div>;
 * ```
 *
 * @see ActorManager for more details about the architecture and management of actor stores.
 * @see ActorState for the structure and possible states an actor can hold.
 */
export const useActorStore = ActorHooks.useActorStore
