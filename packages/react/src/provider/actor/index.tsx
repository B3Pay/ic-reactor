import React, { createContext, useMemo, useContext } from "react"
import {
  BaseActor,
  FunctionName,
  UseMethodCallArg,
  UseQueryCallArgs,
  UseUpdateCallArgs,
} from "../../types"
import { getActorHooks } from "../../helpers/actor"
import {
  CreateActorOptions,
  ActorContextType,
  ActorProviderProps,
} from "./types"
import { useReactor } from "../../hooks/useReactor"

export const {
  ActorContext,
  ActorProvider,
  useActorContext,
  useActorState,
  useQueryCall,
  useUpdateCall,
  useMethodCall,
  useVisitMethod,
} = createReactorContext()

export function createReactorContext<Actor = BaseActor>({
  canisterId: defaultCanisterId,
  ...defaultConfig
}: Partial<CreateActorOptions> = {}) {
  const ActorContext = createContext<ActorContextType | null>(null)

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

    const { actorManager, fetchError, fetching } = useReactor({
      canisterId,
      ...config,
    })

    const hooks = useMemo(() => {
      if (actorManager) {
        return getActorHooks(actorManager) as ActorContextType
      }
      return null
    }, [actorManager?.canisterId])

    return (
      <ActorContext.Provider value={hooks}>
        {fetching || hooks === null ? fetchError ?? loadingComponent : children}
      </ActorContext.Provider>
    )
  }

  ActorProvider.displayName = "ActorProvider"

  const useActorContext = () => {
    const context = useContext(ActorContext) as ActorContextType<Actor> | null

    if (!context) {
      throw new Error("useActor must be used within a ActorProvider")
    }

    return context
  }

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
  const useQueryCall = <M extends FunctionName<Actor>>(
    args: UseQueryCallArgs<Actor, M>
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
  const useUpdateCall = <M extends FunctionName<Actor>>(
    args: UseUpdateCallArgs<Actor, M>
  ) => useActorContext().useUpdateCall(args)

  /**
   * Hook that combines useVisitMethod and useReactorCall for calling actor methods. It provides both the visit service for the method and the ability to make actor calls with state management.
   *
   * @param args Configuration object including the function name and arguments for the actor method call.
   * @returns An object containing the visit function for the method and the current call state (data, error, loading).
   */
  const useMethodCall = <M extends FunctionName<Actor>>(
    args: UseMethodCallArg<Actor, M>
  ) => useActorContext().useMethodCall(args)

  /**
   * Memoizes and returns a visit service function for a specific actor method.
   *
   * @param functionName The name of the actor method to visit.
   * @returns The visit service function for the specified method.
   */
  const useVisitMethod = (functionName: FunctionName<Actor>) =>
    useActorContext().useVisitMethod(functionName)

  return {
    ActorContext,
    ActorProvider,
    useActorContext,
    useActorState,
    useQueryCall,
    useUpdateCall,
    useMethodCall,
    useVisitMethod,
    initialize,
  }
}
