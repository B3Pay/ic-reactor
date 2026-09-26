/**
 * Per-mount IC Reactor wiring.
 *
 * Nothing here is built at module scope, which is the one thing you must not
 * do in an app that server-renders. A reactor owns its `QueryClient`, and query
 * keys carry no caller principal, so a module-scope reactor is a single cache
 * shared by every request the server handles — one visitor's caller-scoped
 * result (`balanceOf(self)`, `myProfile`) can be served to the next.
 * `AuthenticationManager` signs in on its `ClientManager`'s agent, so it
 * belongs in the same request as that manager.
 *
 * `createReactorProvider` runs the factory once per mounted tree, and a server
 * render is its own tree, so nothing is shared across requests. The auth hooks
 * render a fixed state on the server: signed out, with `isAuthenticating:
 * true`, as a browser shows until its session restore settles. When the tree
 * unmounts, the provider disposes the Internet Identity client its
 * `AuthenticationManager` built. It also provides the todo reactor's
 * `QueryClient` to `QueryClientProvider`, which the React Query Devtools in
 * `_app.tsx` read.
 *
 * Components take their hooks from `useTodo()`, typed as `defineReactor`'s
 * result: `useActorQuery` and `useActorMutation` keep their own signatures.
 */
import { createReactorProvider, defineReactor } from "@ic-reactor/react"
import { canisterId, idlFactory } from "declarations/todo"
import type { _SERVICE } from "declarations/todo/todo.did"

export const { ReactorProvider: ICReactorProvider, useReactor: useTodo } =
  createReactorProvider(() =>
    defineReactor<_SERVICE>({
      name: "todo",
      canisterId,
      idlFactory,
      agentOptions: {
        host: process.env.NEXT_PUBLIC_IC_HOST || "http://127.0.0.1:4943"
      }
    })
  )
