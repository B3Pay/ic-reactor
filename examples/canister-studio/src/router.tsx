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
 * Start passes nothing; a test passes a `createTestClient()` client.
 */
export function getRouter(reactor: Client = createAppClient()) {
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
  if (typeof document === "undefined") {
    boundServerReads(queryClient, SERVER_READ_DEADLINE_MS)
  }

  return router
}

/**
 * How long a server render lets any one read run. ic-reactor sets no
 * timeout on a query, and a suspended section holds the response open until
 * its read settles: for a bot, which gets nothing before the whole page is
 * ready, one hung read would be a blank page. Longer than a shared link's
 * own budget (SHARED_READ_BUDGET_MS), which ends its read first.
 */
export const SERVER_READ_DEADLINE_MS = 5_000

/**
 * Cancels every read of `queryClient` still in flight `deadlineMs` after it
 * started, where it stands (`revert: false`): the query ends in an error.
 * Reverted instead, it would be pending again, and the suspended section's
 * next server render would start the same unbounded read once more. The
 * error is never dehydrated (see {@link shouldDehydrateRead}), so the
 * browser renders that section and reads it itself. Returns the unsubscribe.
 */
export function boundServerReads(
  queryClient: QueryClient,
  deadlineMs: number
): () => void {
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  return queryClient.getQueryCache().subscribe((event) => {
    const { query } = event
    const hash = query.queryHash
    if (event.type === "removed" || query.state.fetchStatus === "idle") {
      clearTimeout(timers.get(hash))
      timers.delete(hash)
    } else if (!timers.has(hash)) {
      timers.set(
        hash,
        setTimeout(() => {
          timers.delete(hash)
          void queryClient.cancelQueries(
            { queryKey: query.queryKey, exact: true },
            { revert: false }
          )
        }, deadlineMs)
      )
    }
  })
}

/**
 * Which reads the server sends to the browser: successful ones only. A read
 * still in flight when the router dehydrates is sent once it succeeds: the
 * integration offers each later change of the cache to this filter again
 * while the page streams, before the section that waited for it.
 *
 * Never a failed read, and never a promise that may still fail: the router's
 * serializer sends an Error as `new Error(message)`, and a dehydrated promise
 * that rejects reaches the browser as `Error("redacted")`. Either way
 * `isReactorError()` is false, so ic-reactor would not retry it and the
 * section would show that error. Left out, the read is the browser's: the
 * section the server could not finish renders there, reads again, and shows
 * the real ReactorError only if that read fails too.
 */
export function shouldDehydrateRead(query: Query): boolean {
  return query.state.status === "success"
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
