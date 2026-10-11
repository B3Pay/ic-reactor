import type { Client } from "@ic-reactor/core"
import { ReactorProvider } from "@ic-reactor/react"
import type { Query, QueryClient } from "@tanstack/react-query"
import { createRouter } from "@tanstack/react-router"
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query"
import { DefaultError, DefaultNotFound } from "./components/fallbacks.tsx"
import { createAppClient } from "./lib/reactor.ts"
import { routeTree } from "./routeTree.gen.ts"

/**
 * What every route's `loader`, `beforeLoad` and `head` receive as `context`.
 * Loaders read through `context.reactor` and `context.queryClient`;
 * components use `useClient()` instead (the same client).
 */
export interface RouterContext {
  /** The ic-reactor client of this request (server) or tab (browser). */
  reactor: Client
  /** `reactor.queryClient`: ic-reactor owns it, there is no other. */
  queryClient: QueryClient
}

/**
 * TanStack Start calls this once per request on the server and once per tab
 * in the browser, so the client made here has exactly the lifetime ic-reactor
 * asks for: one per request, one per tab, never shared, never per render.
 */
export function getRouter() {
  const reactor = createAppClient()
  const queryClient = reactor.queryClient

  const router = createRouter({
    routeTree,
    context: { reactor, queryClient } satisfies RouterContext,
    defaultPreload: "intent",
    // Let TanStack Query decide freshness, not the router's loader cache.
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
    defaultNotFoundComponent: DefaultNotFound,
    defaultErrorComponent: DefaultError,
    Wrap: ({ children }) => (
      // Borrowed: the client exists before the provider's factory is called,
      // so the provider never disposes it. ReactorProvider renders
      // QueryClientProvider with reactor.queryClient itself.
      <ReactorProvider client={() => reactor}>{children}</ReactorProvider>
    ),
  })

  setupRouterSsrQueryIntegration({
    router,
    queryClient,
    // ReactorProvider already provides reactor.queryClient.
    wrapQueryClient: false,
    dehydrateOptions: { shouldDehydrateQuery: shouldDehydrateRead },
  })

  return router
}

/**
 * Which reads the server sends to the browser: successful ones, and ones
 * still in flight (they stream as they settle). Never a failed read: the
 * router's serializer sends an Error as `new Error(message)`, so it would
 * reach the browser without its kind, code or mayHaveExecuted, and
 * `isReactorError()` false. Left out, the browser reads it again and gets the
 * real ReactorError.
 */
export function shouldDehydrateRead(query: Query): boolean {
  return (
    query.state.status === "success" ||
    (query.state.status === "pending" && query.state.fetchStatus === "fetching")
  )
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
