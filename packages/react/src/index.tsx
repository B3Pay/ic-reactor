"use client"

/**
 * `@ic-reactor/react` 4: the `'use client'` bindings over `@ic-reactor/core`.
 *
 * A provider that owns one client per tree ({@link ReactorProvider}), a hook
 * that reads it ({@link useClient}), and one that follows who is signed in
 * ({@link useAuth}). Nothing here wraps `useQuery` or `useMutation`: an app
 * calls TanStack Query's own hooks with the options the client builds. The
 * package never re-exports `@ic-reactor/core`, so every name has one import
 * path.
 *
 * The directive above makes this module a client boundary, so a framework
 * that renders on a server (Next.js's App Router, for one) loads it as client
 * code. A Server Component still cannot pass `ReactorProvider` its `client`
 * prop, a function, across that boundary: render the provider from a client
 * module of the app, which a Server Component then renders around its page.
 *
 * @packageDocumentation
 */
import type { AuthState, Client } from "@ic-reactor/core"
import { QueryClientProvider } from "@tanstack/react-query"
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from "react"

/** The client of the nearest {@link ReactorProvider}, or none outside one. */
const ClientContext = createContext<Client | undefined>(undefined)

/**
 * The clients whose disposal this package has run, so that a provider can tell
 * when React hands it a client it already disposed (see {@link ReactorProvider}).
 */
const disposedClients = new WeakSet<Client>()

/** Props of {@link ReactorProvider}. */
export interface ReactorProviderProps {
  /**
   * Builds the client of this tree, such as
   * `() => createClient({ network: "ic", auth: () => new AuthClient() })`.
   *
   * A factory, not a client, so that the provider decides when it runs: once
   * per mounted provider, never per render. Give it no work beyond creating
   * the client (`createClient` does none until the client is used): React may
   * call it twice in development and keep one result.
   *
   * Only the factory of the first render is used. A different function on a
   * later render does not rebuild the client; to replace it, remount the
   * provider by giving it another `key`.
   */
  readonly client: () => Client
  /** The tree that reads the client with {@link useClient} and {@link useAuth}. */
  readonly children: ReactNode
}

/**
 * Gives a tree one client: it builds it from `client` once, on the first
 * render, makes it available to {@link useClient} and {@link useAuth}, renders
 * TanStack Query's `QueryClientProvider` around the children with the
 * client's `QueryClient`, and disposes the client when it unmounts.
 *
 * Put it at the root of the part of the app that calls canisters, in a
 * client module (the example below). On a server it renders inside the
 * request, so the factory runs once per request and no cache or caller is
 * shared between two users, which a client at module scope would be.
 *
 * Disposal is safe in React's development double-mount (`StrictMode` mounts,
 * unmounts and mounts every component again at once): the cleanup only
 * schedules the disposal for the next macrotask, and the second mount cancels
 * it, so a client in use is never disposed. An unmount that is not followed
 * by a mount disposes the client exactly once.
 *
 * React also runs the effects of a subtree again when it shows a hidden
 * `Activity` once more, and that can be long after they were cleaned up. If the
 * client was disposed meanwhile, the provider builds another from the same
 * factory, because a disposed client cannot call, sign in or cache any more.
 * The cost is that hiding a provider inside an `Activity` drops its cache:
 * disposing clears the `QueryClient`, and the client built on the next show
 * starts empty. React cannot tell a hidden subtree from an unmounted one in
 * the cleanup, so there is no way to keep it. To keep a cache across hiding,
 * render the provider above the `Activity`, not inside it.
 *
 * @example
 * ```tsx
 * "use client"
 *
 * import { createClient } from "@ic-reactor/core"
 * import { ReactorProvider } from "@ic-reactor/react"
 * import { AuthClient } from "@icp-sdk/auth/client"
 * import type { ReactNode } from "react"
 *
 * export function Providers({ children }: { children: ReactNode }) {
 *   return (
 *     <ReactorProvider
 *       client={() =>
 *         createClient({ network: "ic", auth: () => new AuthClient() })
 *       }
 *     >
 *       {children}
 *     </ReactorProvider>
 *   )
 * }
 * ```
 */
export function ReactorProvider({
  client: build,
  children,
}: ReactorProviderProps): ReactElement {
  const [client, setClient] = useState(build)
  const firstBuild = useRef(build)
  const replacement = useRef<
    { readonly of: Client; readonly client: Client } | undefined
  >(undefined)
  const pendingDispose = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  )

  useEffect(() => {
    if (disposedClients.has(client)) {
      // A hidden subtree was shown again after its client was disposed. React
      // runs this effect twice in development before the state below commits;
      // both runs must hand it the same client, not build one to drop.
      if (replacement.current?.of !== client) {
        replacement.current = { of: client, client: firstBuild.current() }
      }
      setClient(replacement.current.client)
      return undefined
    }
    // The mount that follows a development unmount: the client is still alive.
    clearTimeout(pendingDispose.current)
    pendingDispose.current = undefined
    return () => {
      pendingDispose.current = setTimeout(() => {
        pendingDispose.current = undefined
        disposedClients.add(client)
        client.dispose()
      }, 0)
    }
  }, [client])

  return (
    <ClientContext.Provider value={client}>
      <QueryClientProvider client={client.queryClient}>
        {children}
      </QueryClientProvider>
    </ClientContext.Provider>
  )
}

/**
 * The client of the nearest {@link ReactorProvider}: the one object that
 * builds canister handles and query options, and that signs users in and out.
 *
 * @throws Error outside a `ReactorProvider`, naming it.
 */
export function useClient(): Client {
  const client = useContext(ClientContext)
  if (client === undefined) {
    throw new Error(
      "[ic-reactor] useClient() and useAuth() need a <ReactorProvider> above them: " +
        "render <ReactorProvider client={() => createClient({ ... })}> around the tree."
    )
  }
  return client
}

/**
 * Who a server render, and the first render of a hydrating page, call as:
 * nobody. It is what `createClient` reports for an anonymous client, one
 * constant for every render, so that the HTML a server wrote and the markup
 * the browser's first render produces agree even when the browser holds a
 * session.
 */
const SERVER_STATE: AuthState = Object.freeze({
  status: "anonymous",
  principal: "2vxsx-fae",
})

const serverState = (): AuthState => SERVER_STATE

/**
 * Who calls, and how to change it: the client's {@link AuthState} (`status`
 * and `principal`) with `signIn` and `signOut` forwarded to the client.
 *
 * It follows the client with `useSyncExternalStore`, so a component renders
 * again once per change of status or principal and never otherwise (a renewed
 * delegation, or a parent that renders, does not). The object it returns is
 * the same until the state changes, so it is safe in a dependency array or
 * as a prop of a memoized child.
 *
 * On a server, and on the first render of a hydrating page, the state is
 * `anonymous`: the server has no session, and rendering the browser's would
 * not match the server's HTML. A browser that is signed in renders again with
 * its own state right after hydration. A component that reads `status` before
 * then should show the same thing signed out and while the session is read.
 *
 * `signIn` and `signOut` reject like {@link Client.signIn} and
 * {@link Client.signOut}: on a client built with `identity`, which has no
 * sign-in, and on a server.
 *
 * @throws Error outside a {@link ReactorProvider}.
 */
export function useAuth(): AuthState & {
  /** Signs in through the client's auth, passing `options` on. */
  signIn(options?: unknown): Promise<void>
  /** Signs out through the client's auth. */
  signOut(options?: unknown): Promise<void>
} {
  const client = useClient()
  const state = useSyncExternalStore(
    client.subscribe,
    client.authState,
    serverState
  )
  return useMemo(
    () => ({
      status: state.status,
      principal: state.principal,
      signIn: (options?: unknown) => client.signIn(options),
      signOut: (options?: unknown) => client.signOut(options),
    }),
    [client, state]
  )
}
