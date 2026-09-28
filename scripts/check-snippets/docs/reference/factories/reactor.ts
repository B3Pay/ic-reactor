// `./reactor` of the factory pages: `backend`, a DisplayReactor of the pages'
// social canister (`declarations/backend.ts`), and the other reactors their
// examples name: `rawBackend`, a raw `Reactor` of the same canister, `ledger`, a
// raw `Reactor` of an ICRC-1 ledger, whose account owners are `Principal`s, and
// `todoReactor`, a DisplayReactor of a todo canister.
import { defineDisplayReactor, defineReactor } from "@ic-reactor/react"
import {
  canisterId as ledgerCanisterId,
  idlFactory as ledgerIdlFactory,
  type _SERVICE as LedgerService,
} from "../../../app/declarations/ledger"
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

export const { reactor: rawBackend } = defineReactor<_SERVICE>({
  name: "backend",
  idlFactory,
  canisterId,
})

export const { reactor: ledger } = defineReactor<LedgerService>({
  name: "ledger",
  idlFactory: ledgerIdlFactory,
  canisterId: ledgerCanisterId,
})

export const { reactor: todoReactor } = defineDisplayReactor<TodoService>({
  name: "todo",
  idlFactory: todoIdlFactory,
  canisterId: todoCanisterId,
})
