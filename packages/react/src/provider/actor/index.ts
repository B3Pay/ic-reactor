import { createReactorContext } from "./context"

export const {
  ActorProvider,
  useActorState,
  useQueryCall,
  useUpdateCall,
  useMethodCall,
  useVisitMethod,
} = createReactorContext()

export { createReactorContext, extractActorHooks } from "./context"
