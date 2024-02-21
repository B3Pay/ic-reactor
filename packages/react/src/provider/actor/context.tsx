import React, { createContext, useMemo, useContext } from "react"
import {
  BaseActor,
  FunctionName,
  UseMethodCallArg,
  UseQueryCallArgs,
  UseUpdateCallArgs,
} from "../../types"
import {
  CreateActorOptions,
  ActorContextType,
  ActorProviderProps,
} from "./types"
import { useReactor } from "../../hooks/useReactor"

export function createReactorContext<A = BaseActor>({
  canisterId: defaultCanisterId,
  ...defaultConfig
}: Partial<CreateActorOptions> = {}) {
  const ActorContext = createContext<ActorContextType<A> | null>(null)

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

    const { fetchError, fetching, hooks } = useReactor<A>({
      canisterId,
      ...config,
    })

    return (
      <ActorContext.Provider value={hooks as ActorContextType<A>}>
        {fetching || hooks === null ? fetchError ?? loadingComponent : children}
      </ActorContext.Provider>
    )
  }

  ActorProvider.displayName = "ActorProvider"

  return {
    ActorProvider,
    ...extractActorHooks<A>(ActorContext),
  }
}

export function extractActorHooks<A = BaseActor>(
  ActorContext: React.Context<ActorContextType<A> | null>
) {
  /**
   * Hook for accessing the actor context, including the actor manager and state.
   * @returns The actor context, including the actor manager and state.
   * @example
   * ```tsx
   * function ActorComponent() {
   *  const { initialize, useActorState, useQueryCall, useUpdateCall, useMethodCall, useVisitMethod } = useActorContext();
   *  const { canisterId } = useActorState();
   *
   *  return (
   *   <div>
   *     <p>Canister ID: {canisterId}</p>
   *   </div>
   *  );
   * }
   * ```
   */
  const useActorContext = () => {
    const context = useContext(ActorContext) as ActorContextType<A> | null

    if (!context) {
      throw new Error("useActor must be used within a ActorProvider")
    }

    return context
  }

  /**
   * Initializes the actor manager, setting up the actor's state.
   */
  const initialize = () => useActorContext().initialize()

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
  const useActorState = () => useActorContext().useActorState()

  /**
   * Hook for making query calls to actors. It supports automatic refetching on component mount and at specified intervals.
   *
   * @param options Configuration object for the query call, including refetching options and other configurations passed to useReactorCall.
   * @returns An object containing the query call function and the current call state (data, error, loading, call, reset).
   * @example
   * ```tsx
   * function QueryCallComponent() {
   *    const { call, data, loading } = useQueryCall({
   *      functionName: 'getUserProfile',
   *      args: ['123'],
   *      refetchOnMount: true,
   *      refetchInterval: 5000, // refetch every 5 seconds
   *    });
   *
   *    if (loading) return <p>Loading profile...</p>;
   *
   *    return (
   *      <div>
   *        <p>User Profile: {JSON.stringify(data)}</p>
   *        <button onClick={call}>Refetch</button>
   *      </div>
   *    );
   * }
   * ```
   */
  const useQueryCall = <M extends FunctionName<A>>(
    args: UseQueryCallArgs<A, M>
  ) => useActorContext().useQueryCall(args)

  /**
   * Hook for making update calls to actors, handling loading states, and managing errors. It supports custom event handlers for loading, success, and error events.
   *
   * @param options Configuration object for the actor method call, including the method name, arguments, and event handlers.
   * @returns An object containing the method call function, a reset function to reset the call state to its default, and the current call state (data, error, loading, call, reset).
   * @example
   * ```tsx
   * function UpdateCallComponent() {
   *   const { call, data, loading } = useUpdateCall({
   *      functionName: 'updateUserProfile',
   *      args: ['123', { name: 'John Doe' }],
   *      onLoading: (loading) => console.log('Loading:', loading),
   *      onError: (error) => console.error('Error:', error),
   *      onSuccess: (data) => console.log('Success:', data),
   *   });
   *
   *  if (loading) return <p>Updating profile...</p>;
   *
   *  return (
   *    <div>
   *      <p>Updated Profile: {JSON.stringify(data)}</p>
   *      <button onClick={call}>Update</button>
   *    </div>
   *  );
   * }
   * ```
   */
  const useUpdateCall = <M extends FunctionName<A>>(
    args: UseUpdateCallArgs<A, M>
  ) => useActorContext().useUpdateCall(args)

  /**
   * Hook that combines useVisitMethod and useReactorCall for calling actor methods. It provides both the visit service for the method and the ability to make actor calls with state management.
   *
   * @param args Configuration object including the function name and arguments for the actor method call.
   * @returns An object containing the visit function for the method and the current call state (data, error, loading).
   */
  const useMethodCall = <M extends FunctionName<A>>(
    args: UseMethodCallArg<A, M>
  ) => useActorContext().useMethodCall(args)

  /**
   * Memoizes and returns a visit service function for a specific actor method.
   *
   * @param functionName The name of the actor method to visit.
   * @returns The visit service function for the specified method.
   */
  const useVisitMethod = (functionName: FunctionName<A>) =>
    useActorContext().useVisitMethod(functionName)

  return {
    useActorState,
    useQueryCall,
    useUpdateCall,
    useMethodCall,
    useVisitMethod,
    initialize,
  }
}
