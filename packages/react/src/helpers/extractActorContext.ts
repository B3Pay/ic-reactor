import React from "react"

import type {
  ActorHooksReturnType,
  BaseActor,
  FunctionName,
  UseMethod,
  UseQueryCall,
  UseUpdateCall,
  UseVisitMethod,
  UseVisitService,
} from "@src/types"
import type { CreateActorContextReturnType } from "@src/context/actor/types"

export function extractActorContext<A = BaseActor>(
  actorContext: React.Context<ActorHooksReturnType<A> | null>
): Omit<CreateActorContextReturnType<A>, "ActorProvider"> {
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
    useMethodAttributes,
    useQueryCall,
    useUpdateCall,
    useVisitMethod,
    useVisitService,
    useActorInterface,
    initialize,
  }
}
