// `./reactor` of the reference pages: `backend`, a DisplayReactor of the
// pages' canister (`declarations/backend.ts`), with the hooks bound to it. The
// pages of `Reactor` build a raw `Reactor` in their setup, and this `backend`
// is not one: a nat is text here, an opt is `T | undefined`, a variant has a
// `_type`. The call shapes those pages make (a function name and its
// arguments) hold for both, and none reads a value off `backend`. A snippet of
// theirs that does must build its own raw `Reactor` in the snippet, not lean
// on this one. It also holds the `src/reactor.tsx` of the
// `createReactorProvider` page.
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
