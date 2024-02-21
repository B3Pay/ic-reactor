import { createActorContext } from "./context"

export const {
  ActorProvider: ActorProvider,
  useActorState,
  useQueryCall,
  useUpdateCall,
  useMethodCall,
  useVisitMethod,
} = createActorContext()

export * from "./context"
export * from "./hooks"
