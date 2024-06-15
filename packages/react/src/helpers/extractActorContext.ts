import React from "react"

import type {
  ActorState,
  BaseActor,
  FunctionName,
  IDL,
  InitializeActor,
  UseActorParameters,
  UseActorStore,
  UseMethod,
  UseQueryCall,
  UseUpdateCall,
  UseVisitMethod,
  UseVisitService,
} from "../types"
import type {
  CreateActorContextReturnType,
  CreateActorContextType,
} from "../context/actor/types"

export function extractActorContext<A = BaseActor>(
  actorContext: React.Context<CreateActorContextType<A> | null>
): Omit<
  CreateActorContextReturnType<A>,
  "ActorProvider" | "ActorHookProvider"
> {
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

  const useMethodAttributes = <Actor = A>() =>
    useActorContext().useMethodAttributes<Actor>()

  const useActorStore: UseActorStore<A> = <T>(
    selector = (s: ActorState<A>) => s as T
  ) => {
    return useActorContext().useActorStore(selector)
  }

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

  const useInitializeActor: InitializeActor = (
    idlFactory: IDL.InterfaceFactory,
    actorReConfig?: UseActorParameters
  ) => useActorContext().useInitializeActor?.(idlFactory, actorReConfig)

  return {
    useActorStore,
    useActorState,
    useMethod,
    useMethodNames,
    useMethodAttributes,
    useQueryCall,
    useUpdateCall,
    useVisitMethod,
    useVisitService,
    useActorInterface,
    useInitializeActor,
    initialize,
  }
}
