/**
 * Per-request IC Reactor wiring.
 *
 * Everything here used to be built at module scope, which is the one thing you
 * must not do in an app that server-renders. A reactor owns its `QueryClient`,
 * and query keys carry no caller principal, so a module-scope reactor is a
 * single cache shared by every request the server handles — one visitor's
 * caller-scoped result (`balanceOf(self)`, `myProfile`) can be served to the
 * next. `AuthenticationManager` is worse: it holds mutable identity state, and
 * `createAuthHooks`' `useSyncExternalStore` server snapshot reads whatever
 * identity that shared manager happens to hold at the moment of the render.
 *
 * Building inside a `useState` initializer gives each render tree its own set,
 * so nothing is shared across requests.
 */
import { createContext, useContext, useState } from "react"
import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  ClientManager,
  AuthenticationManager,
  Reactor,
  createActorHooks,
  createAuthHooks
} from "@ic-reactor/react"
import { canisterId, idlFactory } from "declarations/todo"
import type { _SERVICE } from "declarations/todo/todo.did"

function createReactorContext() {
  const queryClient = new QueryClient()

  const clientManager = new ClientManager({
    queryClient,
    agentOptions: {
      host: process.env.NEXT_PUBLIC_IC_HOST || "http://127.0.0.1:4943"
    }
  })

  const authentication = new AuthenticationManager({ clientManager })

  const todoReactor = new Reactor<_SERVICE>({
    name: "todo",
    clientManager,
    canisterId,
    idlFactory
  })

  return {
    queryClient,
    clientManager,
    authentication,
    todoReactor,
    auth: createAuthHooks(authentication),
    todo: createActorHooks(todoReactor)
  }
}

type ReactorContextValue = ReturnType<typeof createReactorContext>

const ReactorContext = createContext<ReactorContextValue | null>(null)

export function ICReactorProvider({ children }: { children: ReactNode }) {
  // The initializer runs once per mounted tree — and a server render is its own
  // tree, so each request gets its own managers and its own cache.
  const [value] = useState(createReactorContext)

  return (
    <QueryClientProvider client={value.queryClient}>
      <ReactorContext.Provider value={value}>
        {children}
      </ReactorContext.Provider>
    </QueryClientProvider>
  )
}

export function useICReactor(): ReactorContextValue {
  const context = useContext(ReactorContext)
  if (!context) {
    throw new Error("useICReactor must be used inside <ICReactorProvider>")
  }
  return context
}

// ── Bound hooks ──────────────────────────────────────────────────────────────
//
// Each is declared with the hook's OWN function type rather than a
// `Parameters<...>` wrapper. That matters: `useActorQuery` is generic over the
// method name, and a rest-args wrapper collapses it to the base signature —
// `data` degrades to `unknown` at every call site, which is exactly the type
// safety this library exists to provide. The hook objects are built once
// alongside the managers, so these functions are stable for the life of the
// tree and safe to call as hooks.

type AuthHooks = ReactorContextValue["auth"]
type TodoHooks = ReactorContextValue["todo"]

export const useAuth: AuthHooks["useAuth"] = (...args) =>
  useICReactor().auth.useAuth(...args)

export const useAgentState: AuthHooks["useAgentState"] = (...args) =>
  useICReactor().auth.useAgentState(...args)

export const useUserPrincipal: AuthHooks["useUserPrincipal"] = (...args) =>
  useICReactor().auth.useUserPrincipal(...args)

/* eslint-disable @typescript-eslint/no-explicit-any */
// The rest parameter has to be `any[]`: the declared type is generic over the
// method name, so there is no concrete tuple to annotate it with. Call sites are
// still fully typed — they resolve against the declared signature, not this
// implementation.
export const useQueryTodo: TodoHooks["useActorQuery"] = (...args: any[]) =>
  (useICReactor().todo.useActorQuery as any)(...args)

export const useMutateTodo: TodoHooks["useActorMutation"] = (...args: any[]) =>
  (useICReactor().todo.useActorMutation as any)(...args)
/* eslint-enable @typescript-eslint/no-explicit-any */

/** The ClientManager for this tree, for imperative work inside effects. */
export function useClientManager(): ClientManager {
  return useICReactor().clientManager
}
