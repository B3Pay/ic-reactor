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
 * was disposed. Each client also carries a method that, called with the
 * client as `this` and a principal's text, returns a frozen view of the
 * client whose keys, read options, `caller()` and `authState()` are that
 * principal's (the client itself for one built with `identity`): what
 * {@link useClient} returns while it renders with a caller that is not the
 * live one. `Symbol.for` keys and a count on `globalThis`, so that this
 * module reads them from whichever copy of core made the client, and imports
 * nothing of core at run time.
 */
const CLIENTS_CREATED = Symbol.for("ic-reactor.clients.created")
const CLIENT_SERIAL = Symbol.for("ic-reactor.client.serial")
const CLIENT_DISPOSED = Symbol.for("ic-reactor.client.disposed")
const CLIENT_AS = Symbol.for("ic-reactor.client.as")

/** A client as core stamps it. */
type Stamped = {
  readonly [CLIENT_SERIAL]?: unknown
  readonly [CLIENT_DISPOSED]?: unknown
  readonly [CLIENT_AS]?: (this: Client, principal: string) => Client
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
 * The part of ES2021's `FinalizationRegistry` used here. Declared in this
 * module because the package compiles against ES2020's lib, and as possibly
 * absent because an older runtime has none.
 */
declare const FinalizationRegistry:
  | (new <T>(cleanup: (held: T) => void) => {
      register(target: object, held: T, unregisterToken: object): void
      unregister(unregisterToken: object): boolean
    })
  | undefined

/*
 * Disposes an owned client whose render React threw away before committing it.
 *
 * React gives a discarded render no cleanup. When a Suspense boundary above
 * the provider suspends during the provider's first render, or `StrictMode`
 * calls the `useState` initializer twice in development and keeps one result,
 * the client built for the render React drops never reaches the effect that
 * disposes it. By then a child's `useAuth()` may have built its auth (an
 * `AuthClient`) and subscribed to it, so every abandoned render leaked an auth
 * and its listeners.
 *
 * So an owned client is registered here against its `Held`, the provider's
 * state, which nothing outside the provider references. If React drops that
 * state, the registry disposes the client after a garbage collection finds the
 * state unreachable. That is a backstop, not a lifecycle: no code chooses the
 * moment, and the language does not even promise it comes, but engines run it
 * after the next collections, and `dispose()` is idempotent.
 *
 * The client is the unregister token, so one `unregister` removes what every
 * dropped render registered for it. Two moments do: a factory call that hands
 * the client back as borrowed (see {@link hold}), and the commit of any
 * provider that renders it. A client that a factory returns again, or that a
 * tree runs on, is not one React threw away, and only an unmount, or its
 * owner, may end it.
 *
 * Not on a server: a server keeps no state after a component renders, while
 * the rest of the request still uses the client, so a collection there would
 * end a client in use. A server's client builds no auth and mounts no
 * `QueryClient`, so it holds nothing to release anyway.
 */
const unclaimed =
  typeof FinalizationRegistry === "function" &&
  typeof window !== "undefined" &&
  !("Deno" in globalThis)
    ? new FinalizationRegistry<Client>((client) => client.dispose())
    : undefined

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
 *
 * An owned client is registered with {@link unclaimed} against this call's
 * `Held`, until a provider commits it. A borrowed one is never registered,
 * and a registration that an earlier, dropped render made for it is removed
 * here: a factory that returns a client again keeps it outside the render. A
 * lazily shared factory (`() => (client ??= createClient(...))`) is the case:
 * the render that created the client owns it, and when React throws that
 * render away the retry gets the same client back as borrowed, then commits
 * and uses it. Left registered, the client would be disposed under the
 * mounted tree at the next collection.
 *
 * That removal is also how the pattern shows itself, so it is reported in
 * development (see {@link reportLazilyShared}). Only the call that created a
 * client registers it, and the first removal ends the registration, so the
 * report comes once per client.
 */
function hold(build: () => Client): Held {
  const before = clientsCreated()
  const client = build()
  const serial = (client as Stamped)[CLIENT_SERIAL]
  const owned =
    typeof serial === "number" ? serial > before : clientsCreated() > before
  const held = { client, owned }
  if (owned) unclaimed?.register(held, client, client)
  else if (unclaimed?.unregister(client)) reportLazilyShared()
  return held
}

/**
 * Node's `process`, as far as it is read here. Declared in this module so the
 * package compiles without Node's types.
 */
declare const process: { readonly env: { readonly NODE_ENV?: string } }

/**
 * Whether to report how a provider's client was handed to it (see
 * {@link reportDisposed} and {@link reportLazilyShared}).
 */
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

/**
 * Reports, in development, a factory that handed back a client which an
 * earlier factory call created and no provider has committed yet. A lazily
 * shared factory (`() => (client ??= createClient(...))`) does that, and so
 * does one that returns a client another provider's factory call created.
 *
 * The provider of the call that created such a client owns it, so it disposes
 * it on unmount under every other tree that uses it; and from the moment React
 * throws the creating render away until a later render gets the client back, a
 * garbage collection can dispose it. Both show up late, as calls that are
 * cancelled, and on React 18 the second window can last a whole fetch of a
 * suspending child. The pattern shows here first, and `StrictMode`, which
 * calls the factory twice on every mount, shows it on the first render of a
 * development build.
 */
function reportLazilyShared(): void {
  if (!isDevelopment()) return
  console.warn(
    "[ic-reactor] <ReactorProvider> got a client that an earlier factory call created (client ??= createClient(...)). " +
      "That call's provider disposes it on unmount, or at a garbage collection if React threw its render away. " +
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
 * unmount. It can also lose the client before any unmount: when React throws
 * away the render that created it (see below), the client stays registered
 * for disposal at collection until the next render gets it back from the
 * factory, so a garbage collection while the fallback shows disposes the
 * client the retry then mounts. Create a shared client eagerly instead. In
 * development, a provider whose factory hands back a client that an earlier
 * factory call created and no provider has committed yet, as a lazily shared
 * factory does, logs a warning (under `StrictMode`, on its first render), and
 * a provider that is given a borrowed client which is already disposed logs an
 * error.
 *
 * Disposal is safe in React's development double-mount (`StrictMode` mounts,
 * unmounts and mounts every component again at once): the cleanup only
 * schedules the disposal for the next macrotask, and the second mount cancels
 * it, so a client in use is never disposed. An unmount that is not followed
 * by a mount disposes an owned client exactly once.
 *
 * React runs no cleanup for a render it throws away before committing it: the
 * first render of a provider below a Suspense boundary that suspends, or the
 * `useState` initializer call that `StrictMode` drops in development. An owned
 * client built for such a render, whose auth a child's {@link useAuth} may
 * already have built, is disposed once that render's state is garbage
 * collected, through a `FinalizationRegistry`. That is later than an unmount
 * would dispose it, at a moment no code chooses, but it is disposed, auth and
 * listeners with it. A client that the factory returns again, or that a
 * provider commits, is taken off the registry, whoever owns it. A runtime
 * without `FinalizationRegistry` never disposes such a client, and a server
 * never registers one: it builds no auth there, and the rest of the request
 * still uses it.
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
    // A client a tree runs on is never left to the registry, whoever owns it:
    // a dropped render may have registered this same client, as the one that
    // created a lazily shared client does before a retry borrows it.
    unclaimed?.unregister(client)
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

/** The provider's client, or the error that names the provider. */
function useProvided(): Client {
  const client = useContext(ClientContext)
  if (client === undefined) {
    throw new Error(
      "[ic-reactor] useClient() and useAuth() need a <ReactorProvider> above them: " +
        "render <ReactorProvider client={() => createClient({ ... })}> around the tree."
    )
  }
  return client
}

/** The principal a server render, and a hydrating render, call as: nobody. */
const ANONYMOUS = "2vxsx-fae"

const anonymous = (): string => ANONYMOUS

/**
 * The client of the nearest {@link ReactorProvider}: the one object that
 * builds canister handles and query options, and that signs users in and out.
 *
 * Build keys and options from what it returns in this render, never from a
 * client held at module scope: they are built for the caller this render
 * shows. It follows the client's caller with `useSyncExternalStore`, so a
 * component that calls it renders again when the caller changes (a sign-in, a
 * switch of account, a sign-out) and never otherwise: a change of status that
 * leaves the caller as it is (a session that expired, or one signed in
 * elsewhere, both call as the anonymous principal) renders nothing. In the
 * steady state it returns the provider's client object itself.
 *
 * On a server, and while a page hydrates, the caller is the anonymous one, as
 * for {@link useAuth}. In a browser that holds a session, the hydrating render
 * gets a view of the client for the anonymous caller: its `queryKey`,
 * `queryOptions`, `caller()` and `authState()` are the anonymous caller's, so
 * the page finds what the server prefetched and dehydrated and matches its
 * HTML; everything else (canisters, `mutationOptions`, `signIn`, `signOut`,
 * the `QueryClient`) is the client's own, and a write signs as the caller
 * current when it runs. Right after hydrating, React renders the component
 * again with the client itself, for the user. A client built with `identity`
 * keeps its caller for good and is always returned as it is.
 *
 * Two consequences of that move on a signed-in reload:
 *
 * - A Suspense boundary that is still dehydrated below a component that
 *   renders with the caller (this hook or {@link useAuth}), because its lazy
 *   code is still loading or, on React 19, its streamed HTML has not arrived,
 *   is rendered on the client when that component moves on: it shows its
 *   fallback instead of the server's HTML, and React 18 reports a recoverable
 *   error. Its data is still the user's. Render such a boundary where no
 *   component that renders with the caller sits above it, or pass it in as
 *   `children`, which a component's own update does not render again.
 * - A read the hydrating render built may still run once (TanStack Query
 *   refetches stale data on mount, and an effect may fetch with the view's
 *   options). It is cancelled before anything is sent (`kind` `"cancelled"`,
 *   `code` `"caller_changed"`), and the component has moved on to the user's
 *   key by then, so it never shows the error. A `QueryCache` `onError` sees
 *   it: ignore `kind` `"cancelled"` there.
 *
 * @throws Error outside a `ReactorProvider`, naming it.
 */
export function useClient(): Client {
  const client = useProvided()
  // The view for the server's caller. A client with one caller for good is
  // its own view and its own server snapshot: it has nothing to move on to
  // after hydrating.
  const view = (client as Stamped)[CLIENT_AS]?.call(client, ANONYMOUS) ?? client
  const principal = useSyncExternalStore(
    client.subscribe,
    client.caller,
    view === client ? client.caller : anonymous
  )
  // Only the server snapshot differs from the live caller, and only while a
  // component hydrates.
  return principal === client.caller() ? client : view
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
  principal: ANONYMOUS,
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
 * On a server, and while a page hydrates, the state is `anonymous`: the
 * server has no session, and rendering the browser's would not match the
 * server's HTML. A browser whose state is another one (signed in, or a session
 * that expired or is signed in elsewhere) renders the component again with its
 * own state right after hydration; an anonymous one does not, and keeps the
 * object. A component that reads `status` before then should show the same
 * thing signed out and while the session is read. On a signed-in reload, that
 * move renders a Suspense boundary that is still dehydrated below the
 * component on the client, as for {@link useClient}.
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
  const client = useProvided()
  const state = useSyncExternalStore(
    client.subscribe,
    () => {
      const live = client.authState()
      // The anonymous state (whose principal is always the anonymous one) is
      // the server's own object, so an anonymous tab has nothing to move on
      // to after hydrating.
      return live.status === "anonymous" ? SERVER_STATE : live
    },
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
