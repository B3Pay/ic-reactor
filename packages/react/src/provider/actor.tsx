import React, { createContext, useMemo } from "react"
import { ActorHooksReturnType, BaseActor } from "../types"
import {
  CreateActorContextParameters,
  CreateActorContextReturnType,
  ActorProviderProps,
} from "./types"
import { useActor } from "./hooks/useActor"
import { extractActorContext } from "../helpers/extractActorContext"
/**
 * Creates a React context specifically designed for managing the state and interactions with an actor on the Internet Computer (IC) blockchain.
 * This context facilitates the dynamic creation and management of IC actors within React applications, leveraging the provided configuration options.
 *
 * @param reactorParameters A partial configuration object for the actor context, allowing customization and specification of actor-related settings.
 * - `canisterId`: The default Canister ID to be used if not overridden in the `ActorProvider` component.
 * - Other configurations can include properties related to the actor's interaction, such as agent options or authentication requirements.
 *
 * @returns An object containing the `ActorProvider` component and various hooks for interacting with the actor.
 * - `ActorProvider`: A context provider component that allows child components to access and interact with the configured actor.
 * - Hooks: Custom hooks derived from the actor context, facilitating interactions like querying or updating the actor's state.
 *
 * @example
 * ```jsx
 * import React from 'react';
 * import { createActorContext } from '@ic-reactor/react';
 * import { backend, canisterId, idlFactory } from './declarations/candid'; // Assuming 'declarations/candid' is where your actor interface is defined.
 *
 * // Initialize the actor context with configuration options
 * const { ActorProvider, useActorState, useQueryCall, useUpdateCall } = createActorContext<typeof backend>({
 *   canisterId,
 *   idlFactory, // Optional
 * });
 *
 * // A sample component that utilizes the actor context
 * const App = () => (
 *   <AgentProvider>
 *     <ActorProvider>
 *       <div>
 *         <h1>IC Actor Interaction Example</h1>
 *         <ActorComponent />
 *       </div>
 *     </ActorProvider>
 *   </AgentProvider>
 * );
 *
 * export default App;
 *
 * // A sample component that uses the actor hooks
 * const ActorComponent = () => {
 *   const { data, loading, error } = useQueryCall({
 *      functionName: 'backendMethodName',
 *      args: [],
 *      refetchInterval: 10000,
 *      refetchOnMount: true,
 *   });
  
 *   return (
 *     <div>
 *        {loading && <p>Loading...</p>}
 *        {error && <p>Error: {error.message}</p>}
 *        {data && <p>Actor data: {data}</p>}
 *     </div>
 *   );
 * };
 * ```
 *
 * This function streamlines the process of setting up a context for IC actor interactions within a React app, making it easier
 * to manage actor state and perform actions such as queries or updates. It abstracts away the complexities involved in directly
 * managing IC agents and actors, providing a simple, declarative API for developers.
 */
export function createActorContext<A = BaseActor>(
  config: CreateActorContextParameters = {}
): CreateActorContextReturnType<A> {
  const { canisterId: defaultCanisterId, ...defaultConfig } = config

  const ActorContext = createContext<ActorHooksReturnType<A> | null>(null)

  /**
   * `AgentProvider` is a React functional component that serves as a context provider for IC agent and authentication hooks.
   * It enables any child components to access and use the agent and authentication functionalities seamlessly.
   *
   * The provider encapsulates the logic for initializing and managing an agent manager instance, which is then used to
   * create various hooks related to agent operations and authentication processes. These hooks are made available to all
   * child components through the context, facilitating a centralized and efficient way to interact with the Internet Computer (IC) blockchain.
   *
   * @param children - Child components that can consume the context.
   * @param agentManager - An optional `AgentManager` instance to be used by the provider. If not provided, a new instance
   *                       will be created based on the provided options combined with default configuration.
   * @param options - Configuration options for the `AgentManager`. These options are merged with any default configurations
   *                  specified during the context creation and can include custom settings for the agent, such as identity,
   *                  host URL, etc.
   *
   * Usage:
   * Wrap your component tree with `AgentProvider` to provide all child components access to IC agent and authentication hooks.
   *
   * ```jsx
   * <AgentProvider>
   *   <YourComponent />
   * </AgentProvider>
   * ```
   *
   * Inside `YourComponent` or any of its children, you can use the hooks provided through the context to interact with the IC,
   * manage authentication, and perform other agent-related tasks.
   */
  const ActorProvider: React.FC<ActorProviderProps> = ({
    children,
    canisterId = defaultCanisterId,
    loadingComponent = <div>Fetching canister...</div>,
    ...restConfig
  }) => {
    if (!canisterId) {
      throw new Error("canisterId is required")
    }

    const config = useMemo(
      () => ({
        ...defaultConfig,
        ...restConfig,
      }),
      [defaultConfig, restConfig]
    )

    const { fetchError, fetching, hooks } = useActor<A>({
      canisterId,
      ...config,
    })

    return (
      <ActorContext.Provider value={hooks}>
        {fetching || hooks === null ? fetchError ?? loadingComponent : children}
      </ActorContext.Provider>
    )
  }

  ActorProvider.displayName = "ActorProvider"

  return {
    ActorProvider,
    ...extractActorContext<A>(ActorContext),
  }
}
