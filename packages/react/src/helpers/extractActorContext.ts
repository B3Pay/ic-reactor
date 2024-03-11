import React from "react"
import type {
  ActorHooksReturnType,
  BaseActor,
  CreateActorContextReturnType,
  FunctionName,
  UseMethod,
  UseQueryCall,
  UseUpdateCall,
  UseVisitMethod,
  UseVisitService,
} from "../types"

export function extractActorContext<A = BaseActor>(
  actorContext: React.Context<ActorHooksReturnType<A> | null>
): Omit<CreateActorContextReturnType<A>, "ActorProvider"> {
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
   *
   * function App() {
   *  return (
   *   <ActorProvider canisterId="rrkah-fqaaa-aaaaa-aaaaq-cai">
   *     <ActorComponent />
   *   </ActorProvider>
   *  );
   * }
   * ```
   */
  const useActorContext = () => {
    const context = React.useContext(actorContext)

    if (!context) {
      throw new Error("Actor hooks must be used within a ActorProvider")
    }

    return context
  }

  const initialize = () => useActorContext().initialize()

  const useMethodNames = <Actor = A>() =>
    useActorContext().useMethodNames<Actor>()

  const useActorState = () => useActorContext().useActorState()

  const useMethod: UseMethod<A> = (args) => useActorContext().useMethod(args)

  const useQueryCall: UseQueryCall<A> = (args) =>
    useActorContext().useQueryCall(args)

  const useUpdateCall: UseUpdateCall<A> = (args) =>
    useActorContext().useUpdateCall(args)

  const useVisitMethod: UseVisitMethod<A> = (functionName: FunctionName<A>) =>
    useActorContext().useVisitMethod(functionName)

  const useVisitService: UseVisitService<A> = () =>
    useActorContext().useVisitService()

  const useActorInterface = () => useActorContext().useActorInterface()

  return {
    useActorState,
    useMethod,
    useMethodNames,
    useQueryCall,
    useUpdateCall,
    useVisitMethod,
    useVisitService,
    useActorInterface,
    initialize,
  }
}
