// `./reactor` of the reference pages: `backend`, a DisplayReactor of the
// pages' canister (`declarations/backend.ts`), with the hooks bound to it. The
// pages of `Reactor` show a raw `Reactor` in their setup; the two answer every
// call the pages make the same way, so one `backend` serves them all. It also
// holds the `src/reactor.tsx` of the `createReactorProvider` page.
import {
  createReactorProvider,
  defineDisplayReactor,
  defineReactor,
} from "@ic-reactor/react"
import { canisterId, idlFactory, type _SERVICE } from "./declarations/backend"
import {
  canisterId as todoCanisterId,
  idlFactory as todoIdlFactory,
  type _SERVICE as TodoService,
} from "./declarations/todo"

export const backendApp = defineDisplayReactor<_SERVICE>({
  name: "backend",
  idlFactory,
  canisterId,
})

export const {
  reactor: backend,
  clientManager,
  queryClient,
  authentication,
  identityAttributes,
  useActorQuery,
  useActorSuspenseQuery,
  useActorInfiniteQuery,
  useActorSuspenseInfiniteQuery,
  useActorMutation,
  useActorMethod,
  useAuth,
  useAgentState,
  useUserPrincipal,
  useIdentityAttributes,
} = backendApp

export const { ReactorProvider, useReactor } = createReactorProvider(() =>
  defineReactor<TodoService>({
    name: "todo",
    idlFactory: todoIdlFactory,
    canisterId: todoCanisterId,
  })
)
