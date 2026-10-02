"use client"

/**
 * `@ic-reactor/react` 4: the `'use client'` bindings over `@ic-reactor/core`.
 *
 * A provider that gives a tree one client ({@link ReactorProvider}), a hook
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

/*
 * An internal contract with `@ic-reactor/core`'s `createClient`, not public
 * API (core's `src/client.ts` documents the other side): `globalThis` holds
 * how many clients have been made in this realm, each client carries that
 * count once it was made as its serial, and a getter that says whether it
 * was disposed. `Symbol.for` keys and a count on `globalThis`, so that this
 * module reads them from whichever copy of core made the client, and imports
 * nothing of core at run time.
 */
const CLIENTS_CREATED = Symbol.for("ic-reactor.clients.created")
const CLIENT_SERIAL = Symbol.for("ic-reactor.client.serial")
const CLIENT_DISPOSED = Symbol.for("ic-reactor.client.disposed")

/** A client as core stamps it. */
type Stamped = {
  readonly [CLIENT_SERIAL]?: unknown
  readonly [CLIENT_DISPOSED]?: unknown
}

/** How many clients `createClient` has made in this realm so far. */
const clientsCreated = (): number =>
  Number((globalThis as { [CLIENTS_CREATED]?: unknown })[CLIENTS_CREATED]) || 0

/** A provider's client, and whether the provider disposes it. */
interface Held {
  readonly client: Client
  /** Whether the provider's own factory call created it. */
  readonly owned: boolean
}

/**
 * Calls a provider's factory and decides whether the provider owns what it
 * returns.
 *
 * It owns a client its factory call created, and only that one: the count of
 * clients is read before the call, and a client whose serial is above it was
 * made during the call. A client made before (at module scope, one per tab,
 * and used outside React too) is borrowed. Disposing a borrowed client on
 * unmount killed it for good: the next provider to mount, the next test's
 * render or a remounted route got the same client back from its factory,
 * already disposed, and every call through it was cancelled with no error
 * anywhere (#780). Its owner, not a provider, decides when it ends.
 *
 * A client without a serial, such as a test's spread copy of one, is owned
 * when some client was made during the call: the one it copies, then.
 */
function hold(build: () => Client): Held {
  const before = clientsCreated()
  const client = build()
  const serial = (client as Stamped)[CLIENT_SERIAL]
  const owned =
    typeof serial === "number" ? serial > before : clientsCreated() > before
  return { client, owned }
}

/**
 * Node's `process`, as far as it is read here. Declared in this module so the
 * package compiles without Node's types.
 */
declare const process: { readonly env: { readonly NODE_ENV?: string } }

/** Whether to say so when a provider is given a dead client. */
const isDevelopment = (): boolean => {
  try {
    // Written as is, so that a bundler replaces `process.env.NODE_ENV` with
    // its value. Without a bundler and without Node, `process` throws, and
    // the message is shown.
    return process.env.NODE_ENV !== "production"
  } catch {
    return true
  }
}

/** The disposed clients a provider was handed and that were reported. */
const reported = new WeakSet<Client>()

/**
 * Reports, once per client and in development, a borrowed client that its
 * owner already disposed: a provider cannot replace it (the factory returns
 * the same one), and nothing else would say why every call is cancelled.
 */
function reportDisposed(client: Client): void {
  if (
    (client as Stamped)[CLIENT_DISPOSED] !== true ||
    reported.has(client) ||
    !isDevelopment()
  ) {
    return
  }
  reported.add(client)
  console.error(
    "[ic-reactor] <ReactorProvider> got a disposed client, so every call is cancelled (client_disposed). " +
      "A provider disposes only a client its own factory created: create a shared client eagerly and keep it " +
      "alive, or use client={() => createClient({ ... })}."
  )
}

/** Props of {@link ReactorProvider}. */
export interface ReactorProviderProps {
  /**
   * Returns the client of this tree. Either it creates one, such as
   * `() => createClient({ network: "ic", auth: () => new AuthClient() })`, and
   * the provider owns that client and disposes it when it unmounts; or it
   * returns a client the app created before, at module scope, as
   * `() => client`, and the provider borrows it and never disposes it.
   *
   * A factory, not a client, so that the provider decides when it runs: once
   * per mounted provider, never per render. Give it no work beyond creating or
   * returning the client (`createClient` does none until the client is used):
   * React may call it twice in development and keep one result.
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
 * Gives a tree one client: it gets it from `client` once, on the first
 * render, makes it available to {@link useClient} and {@link useAuth}, renders
 * TanStack Query's `QueryClientProvider` around the children with the
 * client's `QueryClient`, and, if its factory created the client, disposes it
 * when it unmounts.
 *
 * Put it at the root of the part of the app that calls canisters, in a
 * client module (the examples below). On a server it renders inside the
 * request, so a factory that creates the client runs once per request and no
 * cache or caller is shared between two users, which a client at module scope
 * would be.
 *
 * Who disposes the client depends on when it was created, not on where the
 * factory is written. A client the factory call creates belongs to the
 * provider. A client created before the call, such as one at module scope that
 * code outside React uses too, is borrowed: the provider never disposes it,
 * however many times it mounts and unmounts, and the app ends it with
 * `client.dispose()` if it ever needs to. A factory that creates the shared
 * client lazily on its first call (`() => (client ??= createClient(...))`)
 * hands that first provider ownership, and the provider disposes it on
 * unmount; create a shared client eagerly instead. In development, a provider
 * that is given a borrowed client which is already disposed logs an error.
 *
 * Disposal is safe in React's development double-mount (`StrictMode` mounts,
 * unmounts and mounts every component again at once): the cleanup only
 * schedules the disposal for the next macrotask, and the second mount cancels
 * it, so a client in use is never disposed. An unmount that is not followed
 * by a mount disposes an owned client exactly once.
 *
 * React also runs the effects of a subtree again when it shows a hidden
 * `Activity` once more, and that can be long after they were cleaned up. If an
 * owned client was disposed meanwhile, the provider builds another from the
 * same factory, because a disposed client cannot call, sign in or cache any
 * more. The cost is that hiding a provider inside an `Activity` drops its
 * cache: disposing clears the `QueryClient`, and the client built on the next
 * show starts empty. React cannot tell a hidden subtree from an unmounted one
 * in the cleanup, so there is no way to keep it. To keep a cache across
 * hiding, render the provider above the `Activity`, not inside it, or give it
 * a borrowed client, which is never disposed.
 *
 * @example
 * A client per provider, owned and disposed by it (on a server, one per
 * request):
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
 *
 * @example
 * One client per tab, created at module scope and used outside React too.
 * The provider borrows it and never disposes it (browser-only: on a server a
 * module-scope client is shared by every request):
 * ```tsx
 * "use client"
 *
 * import { createClient } from "@ic-reactor/core"
 * import { ReactorProvider } from "@ic-reactor/react"
 * import { AuthClient } from "@icp-sdk/auth/client"
 * import type { ReactNode } from "react"
 *
 * export const client = createClient({
 *   network: "ic",
 *   auth: () => new AuthClient(),
 * })
 *
 * export function Providers({ children }: { children: ReactNode }) {
 *   return <ReactorProvider client={() => client}>{children}</ReactorProvider>
 * }
 * ```
 */
export function ReactorProvider({
  client: build,
  children,
}: ReactorProviderProps): ReactElement {
  const [held, setHeld] = useState(() => hold(build))
  const { client, owned } = held
  const firstBuild = useRef(build)
  const replacement = useRef<
    { readonly of: Client; readonly held: Held } | undefined
  >(undefined)
  const pendingDispose = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  )

  useEffect(() => {
    if (!owned) {
      // Borrowed: never disposed here, so there is nothing to schedule, to
      // cancel or to replace.
      reportDisposed(client)
      return undefined
    }
    if (disposedClients.has(client)) {
      // A hidden subtree was shown again after its client was disposed. React
      // runs this effect twice in development before the state below commits;
      // both runs must hand it the same client, not build one to drop.
      if (replacement.current?.of !== client) {
        replacement.current = { of: client, held: hold(firstBuild.current) }
      }
      setHeld(replacement.current.held)
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
  }, [client, owned])

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
