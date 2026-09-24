/**
 * Reactor Provider Factory - builds an app's reactors once per mounted tree.
 *
 * A server renders every request through the same module graph, so a reactor
 * built at module scope is one cache shared by every visitor: query keys carry
 * no caller principal, and one request's caller-scoped result can be served to
 * the next. The setup belongs inside the render tree instead, built in a
 * `useState` initializer and handed down through context. Apps wrote that
 * provider by hand (examples/nextjs had one of 93 lines) and then forwarded
 * each hook out of the context with an `as any` cast, because a hook that is
 * generic over the method name has no parameter tuple a typed wrapper could
 * name.
 *
 * `createReactorProvider` is that provider. `useReactor()` returns what the
 * factory built, typed as the factory's return, so every hook on it keeps its
 * own generic signature and needs no forwarder.
 */
import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useState,
} from "react"
import type { ReactElement, ReactNode } from "react"
import { QueryClientProvider } from "@tanstack/react-query"
import type { QueryClient } from "@tanstack/react-query"
import type { AuthenticationManager } from "./auth/authentication-manager.js"
import {
  authenticationOf,
  collectAuthentication,
} from "./ownedAuthentication.js"

/**
 * Props of the provider {@link createReactorProvider} returns: `children`, and
 * the props its factory takes.
 */
export type ReactorProviderProps<TProps extends object = {}> = TProps & {
  children?: ReactNode
}

/** Options for {@link createReactorProvider}. */
export interface CreateReactorProviderOptions {
  /**
   * Render a `QueryClientProvider` for the QueryClient the built value uses,
   * so that `useQueryClient()`, React Query Devtools and `HydrationBoundary`
   * below the provider read the cache the reactor hooks fill. The reactor
   * hooks do not need it: each binds to its reactor's own QueryClient.
   *
   * Rendered only when the value holds exactly one QueryClient, found on the
   * value and on its own properties: a `defineReactor` result, a reactor or a
   * `ClientManager` brings its manager's, and a `QueryClient` counts as
   * itself. Pass `false` to leave that context to a provider of your own.
   *
   * @default true
   */
  queryClientProvider?: boolean
}

/** What {@link createReactorProvider} returns. */
export interface CreateReactorProviderReturn<
  TValue extends object,
  TProps extends object = {},
> {
  /**
   * Builds the value once per mount and provides it to `useReactor`.
   *
   * Its props, other than `children`, are passed to the factory when it
   * mounts and are not read again. To build a new value, give the provider a
   * new `key`: React then unmounts the old tree, which releases the old value,
   * and mounts a new one.
   */
  ReactorProvider: (props: ReactorProviderProps<TProps>) => ReactElement
  /**
   * The value the nearest `ReactorProvider` built, or one of its properties
   * when given that property's name. A hook: call it in a component or a
   * custom hook below the provider. It throws when there is none.
   */
  useReactor: {
    <TKey extends keyof TValue>(key: TKey): TValue[TKey]
    // Last, so that `ReturnType<typeof useReactor>` is the whole value.
    (): TValue
  }
}

/**
 * Creates a provider that builds an app's reactors once per mounted tree, and
 * a `useReactor()` hook that returns what it built, fully typed.
 *
 * This is the setup a server-rendered app needs. The factory runs in a
 * `useState` initializer, once per mounted tree, and a server render is a tree
 * of its own: each request builds its own `ClientManager`, `QueryClient`,
 * reactors and `AuthenticationManager`, so no cache or identity is shared
 * between visitors. The first render needs no effect, so the server's HTML is
 * complete, and the browser builds a fresh value from the same props to
 * hydrate it. In a client-only app it works the same, one value per mount.
 *
 * The factory returns anything: a `defineReactor` or `defineDisplayReactor`
 * result, a record of them, reactors and managers built by hand, query and
 * mutation objects from `createQuery` or `createMutation`. `useReactor()`
 * returns it with the factory's own return type, so its hooks keep their
 * generic signatures. `useReactor("todo")` returns one property of it.
 *
 * When the tree unmounts, the provider disposes each `AuthenticationManager`
 * built for the value, releasing the Internet Identity client it built: those
 * constructed while the factory ran, and the one a `defineReactor` result in
 * the value, or among its own properties, builds on first use (a result that
 * never used authentication builds none). A manager built elsewhere and
 * handed in, such as an app-wide one passed as `authentication` or as a
 * prop, is left to whoever built it. `dispose()` only forgets the client, and
 * the next sign-in builds a new one, so this is safe under StrictMode, which
 * runs the cleanup and then the effect again on the same value.
 *
 * It also renders a `QueryClientProvider` for the value's QueryClient; see
 * {@link CreateReactorProviderOptions.queryClientProvider}.
 *
 * A suspense hook below the provider may suspend its first render: React
 * renders the same element again when the data arrives, and the provider
 * reuses the value that first render built, whether the Suspense boundary
 * sits above the provider or, while hydrating, there is none. A provider that
 * a transition mounts (`startTransition`, a client-side navigation) can be
 * rendered from a new element on each retry and build a new value each time,
 * so give its suspending components a `<Suspense>` boundary inside it.
 *
 * Call `createReactorProvider` at module scope: it builds nothing itself,
 * only the context, and every mounted provider builds its own value. In the
 * Next.js App Router that module needs `"use client"`, like any module with
 * hooks; a server component renders the provider from there.
 *
 * @param factory - Builds the value. It receives the provider's props other
 * than `children`, and runs once per mounted provider.
 * @param options - See {@link CreateReactorProviderOptions}.
 *
 * @example One canister, with Internet Identity
 * ```tsx
 * "use client"
 * import { createReactorProvider, defineReactor } from "@ic-reactor/react"
 * import { canisterId, idlFactory, type _SERVICE } from "./declarations/todo"
 *
 * export const { ReactorProvider, useReactor } = createReactorProvider(() =>
 *   defineReactor<_SERVICE>({ name: "todo", idlFactory, canisterId })
 * )
 *
 * function Todos() {
 *   const { useActorQuery, useAuth } = useReactor()
 *   const { isAuthenticated } = useAuth()
 *   const { data } = useActorQuery({ functionName: "getAllTodos" })
 *   return <p>{isAuthenticated ? data?.length : "Sign in"}</p>
 * }
 *
 * // app/layout.tsx (a server component)
 * // <ReactorProvider>{children}</ReactorProvider>
 * ```
 *
 * @example Several canisters sharing one agent and one sign-in
 * ```tsx
 * export const { ReactorProvider, useReactor } = createReactorProvider(() => {
 *   const backend = defineReactor<Backend>({
 *     name: "backend",
 *     idlFactory: backendIdl,
 *     canisterId: backendId,
 *   })
 *   const ledger = defineDisplayReactor<Ledger>({
 *     name: "ledger",
 *     idlFactory: ledgerIdl,
 *     canisterId: ledgerId,
 *     authentication: backend.authentication,
 *   })
 *   return { backend, ledger }
 * })
 *
 * function Balance() {
 *   const { data } = useReactor("ledger").useActorQuery({
 *     functionName: "icrc1_total_supply",
 *   })
 *   return <span>{data}</span>
 * }
 * ```
 *
 * @example Props for the factory, and a new key to build again
 * ```tsx
 * export const { ReactorProvider: LedgerProvider, useReactor: useLedger } =
 *   createReactorProvider(({ canisterId }: { canisterId: string }) =>
 *     defineDisplayReactor<Ledger>({ name: "ledger", idlFactory, canisterId })
 *   )
 *
 * // Read once per mount: the key makes a new canister a new tree.
 * <LedgerProvider key={canisterId} canisterId={canisterId}>
 *   <TokenPage />
 * </LedgerProvider>
 * ```
 */
export function createReactorProvider<
  TValue extends object,
  // `| undefined` so that a factory whose props are optional, as in
  // `({ host = "..." }: { host?: string } = {})`, still types them.
  TProps extends object | undefined = {},
>(
  factory: (props: TProps) => TValue,
  options: CreateReactorProviderOptions = {}
): CreateReactorProviderReturn<TValue, NonNullable<TProps>> {
  const { queryClientProvider = true } = options
  const ReactorContext = createContext<TValue | null>(null)

  // What a browser render built and has not committed yet, by the props
  // object that render received. React throws away the state of a tree that
  // suspends before it first commits, and renders it again, from the same
  // element, once the promise settles. A value built afresh for that render
  // came with an empty QueryClient, so a suspense query below, with no
  // Suspense boundary between it and this provider, fetched again, suspended
  // again and rebuilt the value in an endless loop of canister calls. The
  // render that follows reuses the value instead, and so does StrictMode's
  // second call of the initializer, which would otherwise build a value only
  // to drop it. A server keeps nothing here: it never commits, and a
  // module-scope element rendered for each request would hand one request's
  // value to the next.
  const uncommitted = new WeakMap<object, Built<TValue>>()

  function ReactorProvider(
    providerProps: ReactorProviderProps<NonNullable<TProps>>
  ): ReactElement {
    // Once per mounted tree. A server renders each request as a tree of its
    // own, so each request builds its own value and nothing it caches is seen
    // by another. The props are read here only; a new `key` builds again.
    const [built] = useState(() => {
      const pending = uncommitted.get(providerProps)
      if (pending) return pending
      const { children: _children, ...props } = providerProps
      const { value, built: authentication } = collectAuthentication(() =>
        factory(props as unknown as TProps)
      )
      const next: Built<TValue> = {
        value,
        authentication,
        queryClient: queryClientProvider ? soleQueryClient(value) : undefined,
      }
      if (!isServer()) {
        next.pendingProps = providerProps
        uncommitted.set(providerProps, next)
      }
      return next
    })

    // Releases the Internet Identity clients of the managers built for this
    // value once this tree unmounts. A v10 client listens to the page until
    // it is disposed, so each remount would otherwise leave one behind.
    // dispose() only forgets the client: StrictMode runs this cleanup and then
    // the effect again on the same value, and the next sign-in builds a new
    // one. A server runs no effects, and its managers build no client.
    useEffect(() => {
      // Committed: the value is this mount's, and a later mount of the same
      // element builds its own.
      if (built.pendingProps) {
        uncommitted.delete(built.pendingProps)
        built.pendingProps = undefined
      }
      return () => disposeAuthentication(built)
    }, [built])

    const provided = createElement(
      ReactorContext.Provider,
      { value: built.value },
      providerProps.children
    )
    return built.queryClient
      ? createElement(
          QueryClientProvider,
          { client: built.queryClient },
          provided
        )
      : provided
  }

  function useReactor<TKey extends keyof TValue>(key: TKey): TValue[TKey]
  function useReactor(): TValue
  function useReactor(key?: keyof TValue) {
    const value = useContext(ReactorContext)
    if (value === null) {
      throw new Error(
        "[ic-reactor] useReactor() was called outside its <ReactorProvider>. " +
          "Render the component below the ReactorProvider returned by the " +
          "same createReactorProvider() call: each call has a context of its own."
      )
    }
    return key === undefined ? value : value[key]
  }

  return { ReactorProvider, useReactor }
}

/** What a provider built, and until it commits, the props it built it from. */
interface Built<TValue> {
  value: TValue
  /** The managers constructed while the factory ran. */
  authentication: AuthenticationManager[]
  queryClient: QueryClient | undefined
  pendingProps?: object
}

/**
 * Whether this render runs on a server, as TanStack Query decides it: Deno
 * defines `window` without being a browser.
 */
const isServer = () => typeof window === "undefined" || "Deno" in globalThis

/**
 * The value and each of its own data properties: where a built value keeps
 * what it built. Accessors are skipped rather than read, because reading
 * one can build what it returns: a `defineReactor` result's `authentication`
 * builds the manager on first read.
 */
function partsOf(value: object): object[] {
  const parts = [value]
  for (const descriptor of Object.values(
    Object.getOwnPropertyDescriptors(value)
  )) {
    const part: unknown = descriptor.value
    if (typeof part === "object" && part !== null) parts.push(part)
  }
  return parts
}

function isQueryClient(candidate: unknown): candidate is QueryClient {
  const client = candidate as Partial<QueryClient> | null | undefined
  return (
    typeof client?.getQueryCache === "function" &&
    typeof client.mount === "function"
  )
}

/**
 * The QueryClient the value uses, when it uses exactly one. A reactor, a
 * `ClientManager` and a `defineReactor` result each bring theirs as
 * `queryClient`.
 */
function soleQueryClient(value: object): QueryClient | undefined {
  const clients = new Set<QueryClient>()
  for (const part of partsOf(value)) {
    const client = isQueryClient(part)
      ? part
      : (part as { queryClient?: unknown }).queryClient
    if (isQueryClient(client)) clients.add(client)
  }
  if (clients.size !== 1) return undefined
  const [client] = clients
  return client
}

/**
 * Disposes each `AuthenticationManager` built for the value, once each: those
 * constructed while the factory ran, and the one each `defineReactor` result
 * in the value or among its own properties has built since. A manager built
 * elsewhere and handed in is left to whoever built it.
 */
function disposeAuthentication({ value, authentication }: Built<object>): void {
  const managers = new Set(authentication)
  for (const part of partsOf(value)) {
    const owned = authenticationOf(part)
    if (owned) managers.add(owned)
  }
  for (const manager of managers) manager.dispose()
}
