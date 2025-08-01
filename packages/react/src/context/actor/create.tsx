import React from "react"
import { useActor } from "../../hooks/useActor"
import { extractActorContext } from "../../helpers/extractActorContext"

import type { ActorHooksReturnType, BaseActor } from "../../types"
import type {
  CreateActorContextParameters,
  CreateActorContextReturnType,
  ActorProviderProps,
  ActorHookProviderProps,
  CreateActorContextType,
  ActorChildrenProps,
  ActorManagerProviderProps,
} from "./types"
import { useActorManager } from "../../hooks/useActorManager"
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
 *   idlFactory, // Optional, wrap the ActorProvider with CandidAdapterProvider
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
 * This function streamlines the process of setting up a context for IC actor interactions within a React app,
 * it provides a type-safe and efficient way to manage actor state and interactions.
 */
export function createActorContext<A = BaseActor>(
  contextConfig: CreateActorContextParameters = {}
): CreateActorContextReturnType<A> {
  const { canisterId: defaultCanisterId, ...defaultConfig } = contextConfig

  const ActorContext = React.createContext<CreateActorContextType<A> | null>(
    null
  )

  const ActorProvider: React.FC<ActorProviderProps> = ({
    children,
    fetchingComponent,
    canisterId = defaultCanisterId,
    errorComponent = (error) => <div>{error}</div>,
    loadingComponent = <div>Loading canister...</div>,
    authenticatingComponent = <div>Authenticating...</div>,
    ...restConfig
  }) => {
    if (!canisterId) {
      throw new Error("canisterId is required")
    }

    const config = React.useMemo(
      () => ({
        ...defaultConfig,
        ...restConfig,
      }),
      [defaultConfig, restConfig]
    )

    const {
      fetchError,
      isAuthenticating: authenticating,
      initializeActor,
      hooks,
    } = useActor<A>({
      canisterId,
      ...config,
    })

    const useInitializeActor = React.useCallback(() => {
      return initializeActor
    }, [initializeActor])

    const ActorChildren: React.FC<ActorChildrenProps> = ({ useActorState }) => {
      const { isInitializing, isInitialized, error } = useActorState()

      return isInitializing
        ? loadingComponent
        : isInitialized
        ? children
        : error
        ? errorComponent(error.message)
        : null
    }

    return (
      <ActorContext.Provider
        value={{ ...(hooks as ActorHooksReturnType<A>), useInitializeActor }}
      >
        {fetchingComponent}
        {hooks === null ? (
          fetchError ? (
            errorComponent(fetchError)
          ) : authenticating ? (
            authenticatingComponent
          ) : (
            loadingComponent
          )
        ) : (
          <ActorChildren useActorState={hooks.useActorState}>
            {children}
          </ActorChildren>
        )}
      </ActorContext.Provider>
    )
  }

  ActorProvider.displayName = "ActorProvider"

  const ActorHookProvider: React.FC<ActorHookProviderProps<A>> = ({
    hooks,
    children,
  }) => {
    return (
      <ActorContext.Provider value={hooks}>{children}</ActorContext.Provider>
    )
  }

  const ActorManagerProvider: React.FC<ActorManagerProviderProps<A>> = ({
    actorManager,
    children,
  }) => {
    const { hooks } = useActorManager<A>({
      actorManager,
    })

    return (
      <ActorContext.Provider value={hooks}>{children}</ActorContext.Provider>
    )
  }

  return {
    ActorProvider,
    ActorHookProvider,
    ActorManagerProvider,
    ...extractActorContext<A>(ActorContext),
  }
}
