/**
 * `createClient`: the one object an app builds, per browser tab or per server
 * request. It decides who calls (a fixed identity, or the signed-in user of an
 * auth it owns), keeps one immutable agent per principal, and owns the
 * `QueryClient` every read is cached in.
 *
 * Public: {@link createClient}, {@link Client}, {@link ClientOptions},
 * {@link AuthLike} and {@link AuthState}. {@link internalsOf} and the types it
 * returns are for the canister builders of this package (`canister.ts`,
 * `options.ts`, `call.ts`) and are not exported from the package entry.
 *
 * Who calls is decided in one place, {@link ClientInternals.agentFor}, and by
 * one rule: a call goes out signed by the principal it was made for, or not at
 * all. An agent is never re-pointed at another identity (`replaceIdentity` is
 * never called); a sign-in, a sign-out or a switch of account makes the next
 * call use another principal's agent, and a call made for the principal that
 * was current before is cancelled instead of being sent as the new one.
 *
 * @module
 */
import type { FuncValue, Principal, Schema } from "@candid-core/schema"
import { DEFAULT_MAX_DEPTH } from "@candid-core/schema/codec"
import {
  AnonymousIdentity,
  HttpAgent,
  type Identity,
} from "@icp-sdk/core/agent"
import { Principal as SdkPrincipal } from "@icp-sdk/core/principal"
import { QueryClient, type QueryKey } from "@tanstack/query-core"
import { createReactorError, retryQuery } from "./errors.js"
import { deserializeData, serializeData } from "./hydration.js"
import { KEY_ROOT } from "./keys.js"
import {
  agentOptionsFor,
  authNetworkFor,
  resolveNetwork,
  type Network,
  type ResolvedNetwork,
} from "./network.js"
import { createBuilders } from "./options.js"
import { isDevelopment, isServer } from "./runtime.js"
import type {
  Canister,
  CanisterMutationOptions,
  CanisterQueryOptions,
  CanisterTarget,
  DataOf,
  ErrorOf,
  MutationOptionsOptions,
  QueryArgs,
  VarsOf,
} from "./types.js"

/** The anonymous principal, `2vxsx-fae`: the caller of every call nobody signed. */
const ANONYMOUS = SdkPrincipal.anonymous().toText()

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * A sign-in the client can own: what `@icp-sdk/auth` 10's `AuthClient` and the
 * `auth` of `createTestClient()` from `@ic-reactor/core/testing` both are, with
 * no adapter.
 *
 * The client reads `getStatus()` and `getPrincipal()` synchronously to decide
 * who calls, asks `getIdentity()` for the identity to sign with only when it
 * builds or checks an agent for a signed-in principal, and re-reads both after
 * every `subscribe()` notification. `signIn()` and `signOut()` are forwarded
 * from {@link Client.signIn} and {@link Client.signOut}, and `dispose()`, when
 * present, is called from {@link Client.dispose}: the client owns the auth its
 * factory built.
 *
 * Another sign-in source (a wallet, a hand-rolled session) fits by
 * implementing these six methods, and `dispose()` if it holds anything. Its
 * `getIdentity()` should return the same object until the identity really
 * changes: the client builds a new agent for every new identity object it is
 * handed, and reads a new object for the same principal as a renewal.
 */
export interface AuthLike {
  /** Who calls are accepted as, or `undefined` when nobody can act. */
  getPrincipal(): { toText(): string } | undefined
  /**
   * Who is signed in. Only `"signed-in"` makes the client call as
   * {@link AuthLike.getPrincipal}; every other state calls anonymously.
   */
  getStatus(): {
    readonly state:
      "signed-in" | "signed-in-elsewhere" | "expired" | "signed-out"
  }
  /** The identity to sign calls with while signed in. */
  getIdentity(): Promise<Identity>
  /** Calls `listener` after each change of who is signed in. Returns a function that stops listening. */
  subscribe(listener: () => void): () => void
  signIn(options?: unknown): Promise<unknown>
  signOut(options?: unknown): Promise<unknown>
  /** Releases what the auth holds. Called once, from {@link Client.dispose}. */
  dispose?(): void
}

/**
 * Who a client calls as, and why. {@link Client.authState} returns it.
 *
 * `principal` is always the principal calls go out as, the same text
 * {@link Client.caller} returns: the signed-in user's when `status` is
 * `"signed-in"`, and the anonymous principal (`2vxsx-fae`) in every other
 * state. An expired session, or one signed in on a sibling origin that this
 * origin holds no credential for, cannot sign a call, so it does not name its
 * principal here either: a check such as `principal !== anonymous` means what
 * it looks like it means. To say whose session ended, read the auth's own
 * `getStatus()`, which keeps the principal in those states.
 *
 * A client built with an `identity` reports `"signed-in"` with that
 * identity's principal, or `"anonymous"` for `identity: "anonymous"` and for
 * an explicit `AnonymousIdentity`. A client on a server reports
 * `"anonymous"`.
 */
export interface AuthState {
  /**
   * - `anonymous`: nobody is signed in (the auth says `signed-out`), the client
   *   runs on a server, or it was built anonymous.
   * - `signed-in`: calls are signed by `principal`.
   * - `expired`: the session ended; calls are anonymous until a sign-in.
   * - `signed-in-elsewhere`: someone is signed in on this domain but this
   *   origin holds no credential for them yet; calls are anonymous.
   */
  readonly status: "anonymous" | "signed-in" | "expired" | "signed-in-elsewhere"
  /** The principal calls go out as, as text. */
  readonly principal: string
}

/**
 * Options for {@link createClient}: a network, and exactly one of `identity`
 * and `auth`, so that who calls is always written down.
 */
export type ClientOptions = {
  /** Where the canisters are. See {@link Network}. */
  readonly network: Network
  /**
   * Whether the `ic_env` cookie (root key and canister ids) is believed. See
   * the `network` option; absent trusts it only when both the page and the
   * replica are local.
   */
  readonly allowEnvConfig?: boolean
  /**
   * The `fetch` every agent of this client sends with. Defaults to the global
   * one. Tests pass a fake replica's `fetch` here; nothing global is touched.
   */
  readonly fetch?: typeof globalThis.fetch
  /**
   * How deep a decoded reply may nest. Defaults to 256. Raise it for replies
   * that nest deeper, such as an ICRC-3 block log's values.
   */
  readonly maxDepth?: number
} & (
  | {
      /**
       * A fixed caller. `"anonymous"` makes a read-only client: every update
       * is refused before it is sent. An `Identity` signs every call, updates
       * included; pass an explicit `new AnonymousIdentity()` for an anonymous
       * client that may send updates.
       */
      readonly identity: Identity | "anonymous"
      readonly auth?: never
    }
  | {
      /**
       * Builds the sign-in this client calls as, such as
       * `(network) => new AuthClient(network)`. It is called once, on first
       * use, and only in a browser: on a server the client is anonymous and
       * never calls it. The client owns what it returns and disposes it with
       * itself.
       *
       * `network` is the client's network under `@icp-sdk/auth` 10's own
       * option names, so `new AuthClient(network)` signs in where the client
       * calls:
       *
       * - `agentOptions`: the host, root key and `shouldFetchRootKey` of the
       *   client's own agents, and its `fetch`, when you gave one.
       * - `identityProvider`: the Internet Identity to sign in with. A trusted
       *   `ic_env` cookie's `INTERNET_IDENTITY_PROVIDER` (with its
       *   `PUBLIC_CANISTER_ID:internet_identity`, or
       *   `rdmx6-jaaaa-aaaaa-aaadq-cai`); else, for `"local"` or a local host,
       *   icp-cli's built-in one at `http://id.ai.localhost:<port>/authorize`;
       *   else absent, which `AuthClient` reads as mainnet's.
       *
       * Absent on a network that is not mainnet's (a project that deploys its
       * own `internet_identity`, `"env"` on a local page with no provider in
       * the cookie, a replica with its own root key), sign-in cannot work: a
       * replica rejects the delegations mainnet's Internet Identity mints.
       * The client says so once, in development, when the factory reads
       * `network.identityProvider`, as `new AuthClient(network)` does. Name
       * the provider:
       * `(network) => new AuthClient({ ...network, identityProvider: { authorizeUrl, canisterId } })`.
       * A factory that names its own provider, as that one does, or builds
       * an auth that is not Internet Identity, never sees the warning.
       *
       * A factory that takes no argument, such as `() => new AuthClient()`,
       * still works on mainnet. It ignores `network`, so on any other network
       * it signs in with mainnet's Internet Identity: pass `network` through.
       */
      readonly auth: (network: {
        readonly agentOptions: {
          readonly host: string
          readonly rootKey?: Uint8Array
          readonly shouldFetchRootKey: boolean
          readonly fetch?: typeof globalThis.fetch
        }
        readonly identityProvider?: {
          readonly authorizeUrl: string
          readonly canisterId: string
        }
      }) => AuthLike
      readonly identity?: never
    }
)

/** What the `auth` factory is handed: `network` in `(network) => new AuthClient(network)`. */
type AuthNetworkArgument = Parameters<
  Extract<ClientOptions, { readonly auth: unknown }>["auth"]
>[0]

/**
 * A client made by {@link createClient}: one per browser tab, or one per
 * request on a server, so that no cache or agent is shared between users.
 */
export interface Client {
  /** The network's segment in query keys: `"ic"`, `"local"`, a custom network's `name ?? host`, or the resolved host for `"env"`. */
  readonly network: string
  /**
   * The `QueryClient` this client owns. Its default `retry` retries a read
   * only after a failure that proves it was not delivered, and never on a
   * server; its dehydrate and hydrate defaults keep `bigint`, `Uint8Array`
   * and the floats JSON cannot write, so a server's `dehydrate()` survives
   * `JSON.stringify` and comes back exact.
   */
  readonly queryClient: QueryClient
  /** The principal calls go out as now, as text: the anonymous principal unless signed in. */
  caller(): string
  /**
   * Who calls go out as, and why. The object is the same until the status or
   * the principal changes, so it can be read with `useSyncExternalStore`.
   */
  authState(): AuthState
  /**
   * Calls `listener` once after each change of {@link Client.authState}, and
   * never for a notification of the auth that changed neither the status nor
   * the principal (a renewed delegation, for one). Returns a function that
   * stops listening. On a disposed client it adds nothing.
   */
  subscribe(listener: () => void): () => void
  /**
   * Signs in through the client's auth, passing `options` on. Listeners are
   * told once the auth settles, even if the auth itself did not notify.
   * Rejects a `TypeError` on a client built with `identity`, which has no
   * sign-in, and an `Error` on a server or after {@link Client.dispose}.
   */
  signIn(options?: unknown): Promise<void>
  /**
   * Signs out through the client's auth, passing `options` on (such as
   * `AuthClient`'s `{ returnTo }`). Rejects like {@link Client.signIn}.
   */
  signOut(options?: unknown): Promise<void>
  /**
   * Releases everything the client holds: it stops listening to its auth and
   * disposes it, clears the `QueryClient`, and drops its agents. Calling it
   * again does nothing.
   *
   * Every call made on the client afterwards, a write included, rejects
   * `cancelled` with code `client_disposed` and `mayHaveExecuted: false`, and
   * sends nothing: a direct call, a query or mutation function, a func
   * reference's function. A call still waiting to be sent (for its caller's
   * identity, or to be sent again) is cancelled the same way. A direct call
   * already sent settles as the replica answers; a read the client's
   * `QueryClient` was running is dropped with the cache.
   */
  dispose(): void

  /**
   * A canister to call: a frozen object with one plain async method per
   * Candid method of `service`, typed from the generated `Actor` you name.
   *
   * ```ts
   * import { actor, type Actor } from "./canisters/icrc1"
   * const ledger = client.canister<Actor>(actor, { id: LEDGER_ID })
   * const balance = await ledger.icrc1_balance_of({ owner, subaccount: null })
   * ```
   *
   * `service` is the `actor` export of a module `candid-core-cli gen` wrote,
   * or the `actor` of `schemaFromContract()`: both make the same calls and the
   * same keys. `<A>` is not checked against `service`; pass the `Actor` of
   * the same module.
   *
   * A method sends its call as the caller signed in at the moment it is
   * called, decodes the reply, and resolves with it as the `Actor` types it,
   * except that a method whose one result is an `Ok`/`Err` variant resolves
   * with the `Ok` payload and rejects `canister_err` with the `Err` one. An
   * update or a oneway by a caller who is not signed in rejects
   * `unauthenticated` and sends nothing. Every failure is a `ReactorError`;
   * see {@link Canister} for what is re-sent.
   *
   * The same service object and the same target give the same canister
   * object on every call, so it can be made during render. See
   * {@link CanisterTarget} for `{ id }`, `{ name }` and `certified`.
   *
   * @throws TypeError for a `service` that is not a service schema, or a
   * target that is not one of the allowed shapes or whose `id` is not
   * principal text.
   */
  canister<A>(service: Schema<Principal>, target: CanisterTarget): Canister<A>

  /**
   * The query key of a read, or the prefix of a group of reads, for
   * `queryClient.invalidateQueries`, `getQueryData` and filters:
   *
   * - `queryKey(c)`: every read of the canister by the current caller.
   * - `queryKey(c, method)`: every read of that method by the current caller,
   *   whatever its arguments. For a method without arguments, which has one
   *   read, this is that read's key, the same as `queryKey(c, method,
   *   undefined)`, so `queryClient.getQueryData(client.queryKey(ledger,
   *   "icrc1_fee"))` finds what `queryOptions(ledger, "icrc1_fee")` cached.
   * - `queryKey(c, method, vars)`: the key `queryOptions(c, method, vars)`
   *   gives, as built now.
   *
   * `getQueryData` and `setQueryData` match a key exactly: hand them a read's
   * whole key, never a prefix (a method's with arguments, or a canister's).
   *
   * Keys are `['ic-reactor', network, caller, canisterId, method, args]` plus
   * `'certified'` for a certified canister (DECISIONS Q5). Build them with
   * this method, never by hand: a key typed out as an array literal is a
   * `QueryKey` like any other, and matches nothing the client invalidates.
   * It never throws for `vars` that do not encode: the key then holds
   * `'$invalid'` and a text of the value.
   *
   * @throws TypeError for a canister of another client, or a method the
   * service does not have.
   */
  queryKey<A, M extends keyof A & string>(
    canister: Canister<A>,
    method?: M,
    vars?: VarsOf<A, M>
  ): QueryKey

  /**
   * TanStack Query options for a read: `useQuery(client.queryOptions(ledger,
   * "icrc1_balance_of", account))`, `queryClient.fetchQuery(...)`, a
   * `QueryObserver`.
   *
   * The variables after `method` follow one rule (DECISIONS Q3): nothing for
   * a method without arguments, the value for one argument, the tuple for two
   * or more. Pass `skipToken` (from `@tanstack/query-core` or
   * `@tanstack/react-query`) in their place while they are not known yet.
   *
   * The read is made as the caller current when the options are built: the
   * key holds their principal, and the query function refuses to run
   * (`cancelled`, nothing sent) once someone else is signed in. Build the
   * options again when the caller changes, as a component does on every
   * render, and the read moves to the new caller's key: one principal's data
   * is never shown under another's.
   *
   * Arguments that do not encode give a key tagged `'$invalid'` and a query
   * function that rejects `invalid_args` with the codec's issues, so a render
   * never throws on half-typed input.
   *
   * `retry` retries only a failure that proves the call was not delivered, at
   * most 3 times, and never on a server.
   *
   * No type says whether a method is a query or an update, so this checks at
   * run time and throws a `TypeError` for an update or a oneway method: a
   * query refetches, and every refetch would run the update again. Use
   * {@link Client.mutationOptions} for a write. An update that returns the
   * same answer however often it runs (ckBTC's `get_btc_address`) can be read
   * with `{ update: "idempotent" }` as the fourth argument: it is fetched once
   * per key and caller (`staleTime: Infinity`, no refetch on mount, focus or
   * reconnect), needs a signed-in caller like any update, and is retried only
   * after a failure that proves it never got in (DECISIONS Q2). It is still a
   * read of its canister, so a write to that canister through
   * {@link Client.mutationOptions} invalidates it by default and it runs once
   * more, as a replicated call: safe for an idempotent method, but a cost. To
   * keep it cached across writes, name the reads a write changes in
   * `invalidates`.
   *
   * A method without results (`() -> () query`) has nothing to cache: its
   * call resolves `undefined`, which TanStack Query takes for a failed read.
   * This throws a `TypeError` for it too; call it directly, as
   * `await canister.method()`.
   *
   * Built from variables that cannot be `skipToken`, the options' `queryFn`
   * is never `skipToken` either, so `useSuspenseQuery` and
   * `useSuspenseQueries` take them as they are. Variables of a type
   * `skipToken` is assignable to, such as `unknown` (a Candid `reserved`
   * argument) or `{}`, may be, so every read of such a method takes the next
   * signature and keeps `SkipToken`.
   *
   * @throws TypeError for an update or oneway method without the opt-in, a
   * method without results, a composite query of a certified canister, a
   * canister of another client, a method the service does not have, or a
   * fourth argument other than `{ update: "idempotent" }`.
   */
  queryOptions<A, M extends keyof A & string>(
    canister: Canister<A>,
    method: M,
    ...args: QueryArgs<A, M, never>
  ): CanisterQueryOptions<DataOf<A, M>, ErrorOf<A, M>, never>
  /**
   * TanStack Query options for a read whose variables may be `skipToken`
   * (`V | SkipToken`, or `skipToken` itself): the options' `queryFn` is
   * `skipToken` for a skipped read, which `useQuery` takes and
   * `useSuspenseQuery` does not. Otherwise the same as the call with
   * variables that cannot be skipped: see that signature for the rules.
   *
   * @throws TypeError as the call with variables that cannot be skipped.
   */
  queryOptions<A, M extends keyof A & string>(
    canister: Canister<A>,
    method: M,
    ...args: QueryArgs<A, M>
  ): CanisterQueryOptions<DataOf<A, M>, ErrorOf<A, M>>

  /**
   * TanStack Query options for a write: `useMutation(client.mutationOptions(
   * ledger, "icrc1_transfer"))`, then `mutate(arg)` with the same argument
   * convention as {@link Client.queryOptions}.
   *
   * The mutation function calls the method as the caller current when it
   * runs, and an update by a caller who is not signed in rejects
   * `unauthenticated` before anything is sent. `retry` is `false`: an update
   * re-sends itself only when the failure proves the first attempt never got
   * in (see {@link Canister}), and a TanStack retry would re-send after
   * failures that do not prove it, running the write twice.
   *
   * `onSettled` invalidates the reads the write may have changed, on this
   * client's `queryClient`, for every caller, certified or not, and waits for
   * the active ones to refetch: after a success, a `canister_err`, and any
   * failure whose `mayHaveExecuted` is `true` (a lost reply: the re-read shows
   * whether it happened). Not after a failure that proves nothing ran
   * (`invalid_args`, `unauthenticated`, `not_delivered`, a reject 1 or 3, a
   * `cancelled` before sending). The reads are every read of the canister
   * written to (DECISIONS Q10), or those listed in `invalidates`: canisters
   * and `[canister, method]` pairs of this client; `[]` invalidates nothing.
   * "Every read" includes an update read with `{ update: "idempotent" }`
   * (such as a ckBTC minter's `get_btc_address` after `update_balance`),
   * whose re-read is one more replicated call; list the reads in
   * `invalidates` to leave it cached.
   *
   * A `{ name }` (the canister written to, or one in `invalidates`) is
   * resolved once per run, in `onMutate`, which TanStack Query runs first
   * and whose result it hands to `onSettled`: a write whose `ic_env` cookie
   * entry changes before it settles (a local redeploy) invalidates the reads
   * of the canister it wrote to. To add your own `onSettled`, call this one
   * from it with every argument it gets; to add your own `onMutate`, call
   * this one from it with both and spread its result into yours:
   * `{ ...options.onMutate(variables, context), previous }`. An `onMutate`
   * that replaces this one keeps the write and its invalidation together
   * from TanStack Query 5.89 on, which hands `mutationFn` and `onSettled` the
   * same run context: `mutationFn` resolves the targets when it starts, and
   * `onSettled` reads them from there. Before 5.89 it leaves `mutationFn` and
   * `onSettled` each to resolve the targets when it runs, so a cookie
   * rewritten between the two can split the write from its invalidation.
   *
   * @throws TypeError for a canister of another client, a method a service
   * does not have, or a third argument other than `{ invalidates }`.
   */
  mutationOptions<A, M extends keyof A & string>(
    canister: Canister<A>,
    method: M,
    options?: MutationOptionsOptions
  ): CanisterMutationOptions<VarsOf<A, M>, DataOf<A, M>, ErrorOf<A, M>>

  /**
   * An async function for a func reference a reply carried, such as an ICRC
   * ledger's archive callback:
   *
   * ```ts
   * import { QueryArchiveFn, type GetBlocksArgs, type BlockRange } from "./canisters/ledger"
   * for (const range of reply.archived_blocks) {
   *   const read = client.func<(arg: GetBlocksArgs) => Promise<BlockRange>>(QueryArchiveFn, range.callback)
   *   const { blocks } = await read({ start: range.start, length: range.length })
   * }
   * ```
   *
   * The call goes to `ref.principal` and `ref.method`, with the arguments,
   * results and mode of `funcSchema` (the generated schema of the func type),
   * through the same path as a canister's methods: the same errors, the same
   * caller rules, the same unwrapping. `F` is not checked against
   * `funcSchema`: a generated func type carries no signature, so write the
   * one its `.did` gives, with the `Ok` payload as the reply of a result.
   *
   * @throws TypeError for a schema that is not a func schema, or a `ref`
   * whose principal is not principal text or whose method is not a name.
   */
  func<F extends (...args: never[]) => Promise<unknown>>(
    funcSchema: Schema<FuncValue>,
    ref: FuncValue
  ): F
}

// ---------------------------------------------------------------------------
// Internals for the canister builders
// ---------------------------------------------------------------------------

/** Who calls now. */
export interface Caller {
  /** The principal calls go out as, as text. */
  readonly principal: string
  /**
   * Whether an update may be sent: signed in with a principal that is not the
   * anonymous one, or built with an `Identity` object (an explicit
   * `AnonymousIdentity` included, the deliberate way to write anonymously).
   * `identity: "anonymous"` never is.
   */
  readonly authenticated: boolean
}

/** The call an agent is asked for, named in the error that cancels it. */
export interface AgentContext {
  readonly method: string
  readonly canisterId: string
}

/** What the canister builders read from a client. Not part of the package entry. */
export interface ClientInternals {
  /** The network, with every decision made. */
  readonly network: ResolvedNetwork
  /** The decode depth bound for replies, from {@link ClientOptions.maxDepth}. */
  readonly maxDepth: number
  /** Who calls now. Reads the auth (building it on first use, in a browser). */
  current(): Caller
  /**
   * Whether {@link Client.dispose} has run. The call path asks it before
   * anything else, so that every call made on a disposed client is cancelled
   * (`client_disposed`): a disposed client calls as the anonymous principal,
   * and a write would otherwise be refused as `unauthenticated`.
   */
  disposed(): boolean
  /**
   * The agent that signs as `principal`, and only as `principal`. It is the
   * one place the client enforces "a call goes out as the principal it was
   * made for, or not at all".
   *
   * A read's query function passes the principal captured with its query key,
   * so data cached under a principal's key is only ever fetched as that
   * principal. A direct call and a mutation function pass
   * `current().principal` read at call time.
   *
   * It resolves the identity for `principal` (the fixed identity, the
   * client's own `AnonymousIdentity`, or the auth's `getIdentity()` for a
   * signed-in principal), and then checks again: if by then the current
   * principal is another one, the client was disposed, or the identity is not
   * `principal`'s, it rejects a `cancelled` `ReactorError` (code
   * `"caller_changed"` or `"client_disposed"`, `mayHaveExecuted: false`)
   * and nothing is sent. An auth whose `getIdentity()` rejects gives an
   * `unauthenticated` one (code `"identity_unavailable"`).
   *
   * A principal's agent is built once and reused; a new identity object for
   * the same principal (a renewed delegation) builds a new agent and replaces
   * the old one, which is never handed out again. Every agent is built with
   * `retryTimes: 0`, so it never re-sends a request on its own: the call path
   * decides every re-send from the classified failure.
   *
   * `retryTimes` also governs the agent's other requests, and setting it to 0
   * costs two recoveries the call path (`call.ts`) has to make up for
   * itself, as read in `@icp-sdk/core` 6.1:
   *
   * - Update polling. An update the replica answers 202, or with a v4 reply
   *   whose certificate has no status for the request, falls back to polling
   *   `read_state`. One fetch failure or 5xx during that polling now ends the
   *   call, and it classifies as `outcome_unknown` with
   *   `mayHaveExecuted: true`: safe, but it gives up on a call the IC may
   *   still answer. `read_state` executes nothing, so the call path can send
   *   the update with `agent.call` and poll its request id with
   *   `pollForResponse`, polling the same request id again after a transient
   *   polling failure. That never runs the update twice, and keeps
   *   `retryTimes: 0` for the `call` and `query` requests themselves, which
   *   is what the setting is for.
   * - A stale query signature. A query reply signed longer ago than the
   *   ingress expiry window no longer makes the agent sync its clock and ask
   *   again: it fails as a `Trust` error (`CertificateOutdatedErrorCode`),
   *   which a read classifies as a retryable `not_delivered`, so a browser
   *   read is asked again through `retryQuery` without a clock sync.
   *
   * Recovery from a refused ingress expiry (the agent syncs its clock once
   * and sends again) does not depend on `retryTimes` and still happens.
   */
  agentFor(principal: string, context: AgentContext): Promise<HttpAgent>
}

const INTERNALS = new WeakMap<Client, ClientInternals>()

/**
 * The internals of a client made by {@link createClient}.
 *
 * @throws TypeError for anything else.
 */
export function internalsOf(client: Client): ClientInternals {
  const internals = INTERNALS.get(client)
  if (internals === undefined) {
    throw new TypeError("[ic-reactor] expected a client made by createClient()")
  }
  return internals
}

// ---------------------------------------------------------------------------
// Option checks
// ---------------------------------------------------------------------------

const AUTH_MEMBERS = [
  "getPrincipal",
  "getStatus",
  "getIdentity",
  "subscribe",
  "signIn",
  "signOut",
] as const

/**
 * Checks what a JavaScript caller (or a cast) can get past the types: exactly
 * one of `identity` and `auth`, an identity that is one, an `auth` that is a
 * factory, and a `maxDepth` candid-core would accept.
 */
function checkOptions(options: ClientOptions): void {
  if (typeof options !== "object" || options === null) {
    throw new TypeError(
      "[ic-reactor] createClient() takes an options object: { network, identity } or { network, auth }."
    )
  }
  const { identity, auth, maxDepth } = options as {
    identity?: unknown
    auth?: unknown
    maxDepth?: unknown
  }
  if (identity !== undefined && auth !== undefined) {
    throw new TypeError(
      "[ic-reactor] createClient() takes identity or auth, not both: identity fixes the caller, auth signs users in and out."
    )
  }
  if (identity === undefined && auth === undefined) {
    throw new TypeError(
      '[ic-reactor] createClient() needs to know who calls: identity: "anonymous" for a read-only client, ' +
        "identity: <Identity> for a fixed signer, or auth: (network) => new AuthClient(network) to sign users in, in a browser."
    )
  }
  if (auth !== undefined && typeof auth !== "function") {
    throw new TypeError(
      "[ic-reactor] auth is a factory, called only in a browser: auth: (network) => new AuthClient(network), not the AuthClient itself."
    )
  }
  if (
    identity !== undefined &&
    identity !== "anonymous" &&
    (typeof identity !== "object" ||
      identity === null ||
      typeof (identity as { getPrincipal?: unknown }).getPrincipal !==
        "function")
  ) {
    throw new TypeError(
      '[ic-reactor] identity is an Identity (such as an Ed25519KeyIdentity or a new AnonymousIdentity()) or "anonymous".'
    )
  }
  if (
    maxDepth !== undefined &&
    !(Number.isSafeInteger(maxDepth) && (maxDepth as number) >= 0)
  ) {
    throw new TypeError(
      `[ic-reactor] maxDepth is a non-negative safe integer, got ${String(maxDepth)}.`
    )
  }
}

/** Checks that an auth factory returned an {@link AuthLike}, naming what it lacks. */
function checkAuth(auth: unknown): AuthLike {
  const missing =
    typeof auth === "object" && auth !== null
      ? AUTH_MEMBERS.filter(
          (name) =>
            typeof (auth as Record<string, unknown>)[name] !== "function"
        )
      : [...AUTH_MEMBERS]
  if (missing.length > 0) {
    throw new TypeError(
      `[ic-reactor] the auth factory returned something that is not an AuthLike: it has no ${missing
        .map((name) => `${name}()`)
        .join(", ")}.`
    )
  }
  return auth as AuthLike
}

/**
 * Checks that the agent can read `host` the way `HttpAgent` reads it (a host
 * without a scheme is read against the page's protocol), so a bad host is a
 * `TypeError` from `createClient` rather than a failure of some later call.
 */
function checkHost(host: string): void {
  try {
    void new URL(
      !/^[a-z]+:/.test(host) && typeof window !== "undefined"
        ? `${window.location.protocol}//${host}`
        : host
    )
  } catch (error) {
    throw new TypeError(
      `[ic-reactor] the network host ${JSON.stringify(host)} is not a URL the agent can read (${
        error instanceof Error ? error.message : String(error)
      }). Give one with a scheme, such as "https://icp-api.io".`
    )
  }
}

let warnedEnvOffPage = false

/**
 * `network: "env"` outside a browser page works for `{ id }` targets only:
 * there is no `ic_env` cookie, so a `{ name }` target never resolves. Said
 * once per process, in development, not once per client: a server builds a
 * client per request.
 */
function warnEnvOffPage(network: Network): void {
  if (
    network !== "env" ||
    !isServer() ||
    warnedEnvOffPage ||
    !isDevelopment()
  ) {
    return
  }
  warnedEnvOffPage = true
  console.warn(
    '[ic-reactor] createClient({ network: "env" }) outside a browser page: there is no ic_env cookie here, ' +
      "so every call to a { name } canister rejects invalid_args (canister_id_unresolved). " +
      "Call canisters by { id } from a server render, a route handler or a script. (Logged once, in development.)"
  )
}

// ---------------------------------------------------------------------------
// What @ic-reactor/react reads of a client
// ---------------------------------------------------------------------------

/*
 * An internal contract between this module and `@ic-reactor/react`'s
 * `ReactorProvider`, not public API: no type names these keys and no entry
 * exports them. Changing a key or what it means breaks the provider.
 *
 * - `ic-reactor.clients.created`, on `globalThis`: how many clients
 *   `createClient` has made in this realm, the client of each
 *   `createTestClient()` among them: both are built by
 *   {@link createClientWith}, which stamps every client it builds.
 * - `ic-reactor.client.serial`, on each client: that count once the client
 *   was made, so the first client's is 1.
 * - `ic-reactor.client.disposed`, on each client: a getter, `true` once
 *   `dispose()` has run.
 * - `ic-reactor.client.as`, on each client: a method that `useClient()`
 *   calls with the client as `this` and the principal (text) a render shows,
 *   when that principal is not the client's live caller: the server's
 *   anonymous one while a page hydrates in a browser that holds a session.
 *   It returns a frozen view of `this` for that principal (see `viewAs` in
 *   {@link createClientWith}), or `this` itself for a client built with
 *   `identity`, whose caller never changes.
 * - `ic-reactor.client.of`, on each view: the object the view was made over.
 *   The provider holds that object, never a view, when its factory returns
 *   one (a component's `useClient()` handed to a nested provider): a view
 *   keeps its principal for good, so a tree on it would never follow the
 *   caller.
 *
 * The provider reads the count, calls its `client` factory, and compares the
 * serial of the client it gets: a higher serial means the factory created the
 * client, and the provider disposes it when it unmounts; a client made before
 * (one at module scope) is borrowed, and the provider never disposes it. The
 * disposal flag lets it say so loudly when it is handed a borrowed client that
 * its owner already disposed.
 *
 * `Symbol.for` keys and a count kept on `globalThis`, so that two copies of
 * this package in one bundle count together, and the provider reads them
 * without importing anything of this package at run time. The keys on a
 * client or a view are non-enumerable, so spreading or logging one does not
 * show them.
 */
const CLIENTS_CREATED = Symbol.for("ic-reactor.clients.created")
const CLIENT_SERIAL = Symbol.for("ic-reactor.client.serial")
const CLIENT_DISPOSED = Symbol.for("ic-reactor.client.disposed")
const CLIENT_AS = Symbol.for("ic-reactor.client.as")
const CLIENT_OF = Symbol.for("ic-reactor.client.of")

/** Counts one more client in this realm, and returns the count. */
function nextSerial(): number {
  const count = (globalThis as { [CLIENTS_CREATED]?: unknown })[CLIENTS_CREATED]
  const serial = (typeof count === "number" ? count : 0) + 1
  try {
    Object.defineProperty(globalThis, CLIENTS_CREATED, {
      value: serial,
      writable: true,
      configurable: true,
    })
  } catch {
    // A frozen global (an SES lockdown) keeps no count. The provider then
    // reads 0 before every factory call and owns every client it is given.
  }
  return serial
}

// ---------------------------------------------------------------------------
// createClient
// ---------------------------------------------------------------------------

const ANONYMOUS_STATE: AuthState = Object.freeze({
  status: "anonymous",
  principal: ANONYMOUS,
})

const ANONYMOUS_CALLER: Caller = Object.freeze({
  principal: ANONYMOUS,
  authenticated: false,
})

const sameState = (a: AuthState, b: AuthState): boolean =>
  a.status === b.status && a.principal === b.principal

/**
 * Who `auth` says calls: its principal only while its status is `signed-in`
 * and that principal is not the anonymous one. Every other state, including
 * one this version does not know, is anonymous.
 */
function callerOf(auth: AuthLike): Caller {
  if (auth.getStatus().state !== "signed-in") return ANONYMOUS_CALLER
  const principal = auth.getPrincipal()?.toText()
  return principal === undefined || principal === ANONYMOUS
    ? ANONYMOUS_CALLER
    : { principal, authenticated: true }
}

/** The {@link AuthState} `auth` stands for. See {@link AuthState} for the rules. */
function stateOf(auth: AuthLike): AuthState {
  const caller = callerOf(auth)
  if (caller.authenticated) {
    return { status: "signed-in", principal: caller.principal }
  }
  const { state } = auth.getStatus()
  return state === "expired" || state === "signed-in-elsewhere"
    ? { status: state, principal: ANONYMOUS }
    : ANONYMOUS_STATE
}

/**
 * Creates a client: who calls, on which network, with which cache.
 *
 * Say who calls with exactly one of `identity` and `auth`. `auth` takes a
 * factory, which the client calls on first use and only in a browser, so the
 * same `createClient(...)` line runs in a server render (anonymous, no auth
 * built) and in the browser (signed in).
 *
 * Build one client per browser tab, or one per request on a server: a client's
 * cache and agents belong to whoever it calls as, and two clients share
 * neither.
 *
 * @throws TypeError for options that do not say who calls, say it twice, or
 * name a network or `maxDepth` that cannot be used.
 *
 * @example
 * ```ts
 * import { AuthClient } from "@icp-sdk/auth/client"
 * import { createClient } from "@ic-reactor/core"
 *
 * const client = createClient({ network: "ic", auth: (network) => new AuthClient(network) })
 * client.subscribe(() => console.log(client.authState()))
 * await client.signIn()
 * ```
 */
export function createClient(options: ClientOptions): Client {
  return createClientWith(options, {})
}

/**
 * What the test client (`@ic-reactor/core/testing`) changes about how a client
 * runs, which no app may. Not part of {@link ClientOptions}, which is public,
 * and not exported from the package entry: {@link createClientWith} is the
 * only way in.
 */
export interface ClientSeams {
  /**
   * Builds the auth factory on a server too. {@link createClient} builds it
   * only in a browser, so that one `createClient({ auth })` line is anonymous
   * in a server render and signed in in the browser. A test client lives in
   * Node, where a test signs users in and out and expects the calls to follow:
   * with the auth never built there, `auth.switchTo(2)` would change nothing a
   * call can see.
   */
  readonly authOnServer?: boolean
}

/**
 * {@link createClient} with the {@link ClientSeams} a test client needs.
 * Internal: not exported from the package entry.
 */
export function createClientWith(
  options: ClientOptions,
  seams: ClientSeams
): Client {
  checkOptions(options)
  const network = resolveNetwork(options.network, {
    allowEnvConfig: options.allowEnvConfig,
  })
  checkHost(network.host)
  warnEnvOffPage(options.network)
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH
  const authFactory = options.auth
  const fixedIdentity =
    options.identity === undefined || options.identity === "anonymous"
      ? undefined
      : options.identity

  // A user's `fetch` is called as a plain function. The agent would call it as
  // its own method, and a browser's native `fetch` throws "Illegal invocation"
  // when called on anything but `window`.
  const userFetch = options.fetch
  const agentFetch: typeof globalThis.fetch | undefined =
    userFetch === undefined
      ? undefined
      : (input: RequestInfo | URL, init?: RequestInit) => userFetch(input, init)

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: retryQuery },
      dehydrate: { serializeData },
      hydrate: { deserializeData },
    },
  })

  /** Signs the anonymous principal's calls in `auth` mode and for `identity: "anonymous"`. */
  const anonymousIdentity = new AnonymousIdentity()

  /** Who calls in `identity` mode; `undefined` in `auth` mode. */
  const fixedCaller: Caller | undefined =
    options.identity === undefined
      ? undefined
      : fixedIdentity === undefined
        ? ANONYMOUS_CALLER
        : Object.freeze({
            principal: fixedIdentity.getPrincipal().toText(),
            authenticated: true,
          })

  /** The {@link AuthState} in `identity` mode; `undefined` in `auth` mode. */
  const fixedState: AuthState | undefined =
    fixedCaller === undefined
      ? undefined
      : fixedCaller.principal === ANONYMOUS
        ? ANONYMOUS_STATE
        : Object.freeze({
            status: "signed-in",
            principal: fixedCaller.principal,
          })

  /**
   * One agent per principal, with the identity it signs with and the number of
   * the identity request that produced it (see `agentFor`).
   */
  const agents = new Map<
    string,
    { identity: Identity; agent: HttpAgent; asked: number }
  >()
  let identityRequests = 0
  const listeners = new Set<() => void>()
  let auth: AuthLike | undefined
  let unsubscribeAuth: (() => void) | undefined
  /** Whether this client said that its network has no identity provider. */
  let warnedAuthNetwork = false
  let disposed = false
  /** What {@link Client.authState} returns: replaced only when the state changes. */
  let snapshot: AuthState = fixedState ?? ANONYMOUS_STATE
  /** The state listeners were last told about, or the one they started with. */
  let notified: AuthState = snapshot

  /**
   * The errors of reads a view built that were refused while someone else
   * was current, and left on a query with no data (see `createBuilders`).
   */
  const refusals = new WeakSet<object>()

  /**
   * Clears the refusals of `principal`'s reads, now that it is current, from
   * the queries that still hold one and nothing else, before any listener
   * renders them: such a query reads as never fetched, so an observer fetches
   * it, where a suspense read would otherwise throw the refusal (TanStack does
   * not refetch an errored query on mount for one).
   */
  function clearRefusals(principal: string): void {
    const queries = queryClient
      .getQueryCache()
      .findAll({ queryKey: [KEY_ROOT, network.keySegment, principal] })
    for (const query of queries) {
      const { error, data, fetchStatus } = query.state
      if (
        error !== null &&
        refusals.has(error) &&
        data === undefined &&
        fetchStatus === "idle"
      ) {
        query.setState({ ...query.state, status: "pending", error: null })
      }
    }
  }

  /**
   * Says, once per client and in development only, that sign-in cannot work
   * on this network: an auth built without an identity provider signs in with
   * mainnet's Internet Identity, whose delegations this replica rejects.
   */
  const warnNoProvider = (gap: string): void => {
    if (warnedAuthNetwork || !isDevelopment()) return
    warnedAuthNetwork = true
    console.warn(
      `[ic-reactor] sign-in cannot work on this network (${network.host}) without an identity provider: ${gap}. ` +
        "The auth factory was given no identityProvider, so an AuthClient built from it signs in with mainnet's " +
        "Internet Identity, whose delegations this replica rejects. Name the provider: " +
        "(network) => new AuthClient({ ...network, identityProvider: { authorizeUrl, canisterId } }). " +
        "(Logged once, in development.)"
    )
  }

  /**
   * What the auth factory is handed (see `authNetworkFor`), with the client's
   * `fetch` in its `agentOptions` when one was given, so an `AuthClient`'s own
   * agents send as the client's do.
   *
   * Where no identity provider could be named, `identityProvider` is a getter
   * that is not enumerable: it returns `undefined`, and its first read warns.
   * So `new AuthClient(network)`, which reads it, warns; a factory that names
   * its own provider with `{ ...network, identityProvider }` never reads it,
   * since a spread copies only enumerable properties; and a factory that
   * ignores `network`, for an auth that is not Internet Identity, never does.
   */
  const authNetwork = (): AuthNetworkArgument => {
    const resolution = authNetworkFor(options.network, network)
    const agentOptions =
      agentFetch === undefined
        ? resolution.network.agentOptions
        : { ...resolution.network.agentOptions, fetch: agentFetch }
    const { gap } = resolution
    if (gap === undefined) return { ...resolution.network, agentOptions }
    const handed = { agentOptions }
    Object.defineProperty(handed, "identityProvider", {
      get: (): undefined => {
        warnNoProvider(gap)
        return undefined
      },
      enumerable: false,
    })
    return handed
  }

  /**
   * The auth, built on first use: never in `identity` mode, never on a server
   * (unless the test client's seam says so), never after
   * {@link Client.dispose}.
   */
  const ensureAuth = (): AuthLike | undefined => {
    if (
      auth !== undefined ||
      authFactory === undefined ||
      disposed ||
      (seams.authOnServer !== true && isServer())
    ) {
      return auth
    }
    const built = checkAuth(authFactory(authNetwork()))
    auth = built
    const initial = stateOf(built)
    if (!sameState(initial, snapshot)) snapshot = Object.freeze(initial)
    notified = snapshot
    unsubscribeAuth = built.subscribe(onAuthChange)
    return built
  }

  const current = (): Caller => {
    if (disposed) return ANONYMOUS_CALLER
    if (fixedCaller !== undefined) return fixedCaller
    const source = ensureAuth()
    return source === undefined ? ANONYMOUS_CALLER : callerOf(source)
  }

  /** Re-reads the state, replacing {@link snapshot} only when it changed. */
  const refresh = (): AuthState => {
    if (disposed || fixedState !== undefined) return snapshot
    const source = ensureAuth()
    const next = source === undefined ? ANONYMOUS_STATE : stateOf(source)
    if (!sameState(next, snapshot)) snapshot = Object.freeze(next)
    return snapshot
  }

  /** Runs after each notification of the auth, and after a sign-in or sign-out. */
  function onAuthChange(): void {
    if (disposed) return
    const state = refresh()
    // An agent signs for one principal. Those that are no longer current are
    // dropped: a call made for them is cancelled before it needs one.
    for (const principal of agents.keys()) {
      if (principal !== state.principal) agents.delete(principal)
    }
    if (state === notified) return
    notified = state
    clearRefusals(state.principal)
    for (const listener of [...listeners]) {
      // A listener may dispose the client; the rest are then not told.
      if (disposed) return
      try {
        listener()
      } catch (error) {
        // One listener's bug must not keep the others from hearing it.
        queueMicrotask(() => {
          throw error
        })
      }
    }
  }

  const identityFor = (principal: string): Promise<Identity> => {
    if (fixedIdentity !== undefined) return Promise.resolve(fixedIdentity)
    if (principal === ANONYMOUS) return Promise.resolve(anonymousIdentity)
    // `current()` named this principal, so the auth exists and is signed in.
    return (auth as AuthLike).getIdentity()
  }

  const agentFor = async (
    principal: string,
    context: AgentContext
  ): Promise<HttpAgent> => {
    const where = { method: context.method, canisterId: context.canisterId }
    const assertCurrent = (): void => {
      if (disposed) {
        throw createReactorError("cancelled", {
          ...where,
          code: "client_disposed",
          reason: "the client was disposed before the call was sent",
        })
      }
      const now = current().principal
      if (now !== principal) {
        throw createReactorError("cancelled", {
          ...where,
          code: "caller_changed",
          reason: `the call was made as ${principal}, but the caller is now ${now}; it was not sent`,
        })
      }
    }

    assertCurrent()
    const asked = ++identityRequests
    let identity: Identity
    try {
      identity = await identityFor(principal)
    } catch (cause) {
      assertCurrent()
      throw createReactorError("unauthenticated", {
        ...where,
        code: "identity_unavailable",
        reason: `the auth could not provide the identity of ${principal}`,
        cause,
      })
    }
    // The identity took time to arrive: whoever is current now decides.
    assertCurrent()
    const signer = identity.getPrincipal().toText()
    if (signer !== principal) {
      throw createReactorError("cancelled", {
        ...where,
        code: "caller_changed",
        reason: `the call was made as ${principal}, but the auth's identity is ${signer}; it was not sent`,
      })
    }

    // The same identity object reuses the agent. A newer one (a renewed
    // delegation) replaces it. An older one that arrives after a newer one was
    // installed, because its request was answered late, gets the newer agent:
    // a replaced agent is never handed out again.
    const entry = agents.get(principal)
    if (
      entry !== undefined &&
      (entry.identity === identity || entry.asked > asked)
    ) {
      return entry.agent
    }
    const agent = HttpAgent.createSync({
      ...agentOptionsFor(network),
      identity,
      fetch: agentFetch,
      // The agent re-sends a request on its own after a fetch failure or a
      // non-2xx status and reports only the last status, so a 429 after a
      // lost first attempt would read as "never delivered" and be re-sent
      // again. With none of its own, every re-send is the call path's,
      // decided from what this attempt proves (see `retryUpdate`). It also
      // ends update polling at the first failed `read_state`; see
      // `ClientInternals.agentFor` for how the call path recovers from that.
      retryTimes: 0,
    })
    agents.set(principal, { identity, agent, asked })
    return agent
  }

  /** The auth a sign-in or sign-out goes through, or why there is none. */
  const authFor = (call: "signIn" | "signOut"): AuthLike => {
    if (disposed) {
      throw new Error(`[ic-reactor] ${call}() on a disposed client.`)
    }
    if (authFactory === undefined) {
      throw new TypeError(
        `[ic-reactor] ${call}() needs a client built with auth; this one was built with identity, which never changes. ` +
          "Build it with auth: (network) => new AuthClient(network) to sign users in and out."
      )
    }
    const source = ensureAuth()
    if (source === undefined) {
      throw new Error(
        `[ic-reactor] ${call}() runs only in a browser: on a server the client is anonymous and never builds its auth.`
      )
    }
    return source
  }

  const internals: ClientInternals = Object.freeze({
    network,
    maxDepth,
    current,
    disposed: () => disposed,
    agentFor,
  })

  /** The views of {@link viewAs}, by the object they were made over and their principal. */
  const views = new WeakMap<object, Map<string, Client>>()

  /**
   * A view of `this` (the client, or an object over it) for a render that
   * shows `principal` while the live caller may be someone else: the server's
   * anonymous caller while a page hydrates in a browser that holds a session.
   *
   * Its `queryKey` and `queryOptions` build for `principal`, so they find
   * what a server prefetched as that caller and render the markup the server
   * wrote; `caller()` and `authState()` say who that is. The read options are
   * the client's own but for the key: a read they build asks `agentFor` for
   * `principal`'s agent, so while someone else is current it is cancelled
   * (`caller_changed`) and never sent. Every other member is `this`'s own:
   * canisters (made for this client, so either one accepts them),
   * `mutationOptions`, direct calls and `func`, which sign as the caller
   * current when they run, the `QueryClient`, `subscribe`, `signIn`,
   * `signOut` and `dispose`.
   *
   * One view per object and principal, so that a component's dependencies are
   * the same from one render to the next. Only the anonymous view and the
   * live caller's are kept past a call for another principal, so switching
   * accounts leaves nothing behind. A client built with `identity` has one
   * caller for good, the one its server render built keys for too: it
   * returns `this`.
   *
   * A view carries the object it was made over (`CLIENT_OF`), which
   * `ReactorProvider` holds in its place, and asked for a view of its own it
   * makes one of that object.
   */
  function viewAs(this: unknown, principal: string): Client {
    const self = (
      typeof this === "object" && this !== null ? this : client
    ) as Client & { readonly [CLIENT_OF]?: Client }
    // A view of a view is a view of what the first was made over.
    const base = self[CLIENT_OF] ?? self
    if (fixedCaller !== undefined) return base
    let byPrincipal = views.get(base)
    if (byPrincipal === undefined) views.set(base, (byPrincipal = new Map()))
    const live = current().principal
    for (const kept of byPrincipal.keys()) {
      if (kept !== principal && kept !== live && kept !== ANONYMOUS) {
        byPrincipal.delete(kept)
      }
    }
    let view = byPrincipal.get(principal)
    if (view === undefined) {
      const caller: Caller = Object.freeze({
        principal,
        authenticated: principal !== ANONYMOUS,
      })
      const state: AuthState =
        principal === ANONYMOUS
          ? ANONYMOUS_STATE
          : Object.freeze({ status: "signed-in", principal })
      const { queryKey, queryOptions } = createBuilders(
        internals,
        () => client,
        () => caller,
        refusals
      )
      view = Object.freeze(
        Object.create(base, {
          caller: { value: () => principal },
          authState: { value: () => state },
          queryKey: { value: queryKey },
          queryOptions: { value: queryOptions },
          [CLIENT_OF]: { value: base },
        }) as Client
      )
      byPrincipal.set(principal, view)
    }
    return view
  }

  const members: Client = {
    ...createBuilders(internals, () => client),
    network: network.keySegment,
    queryClient,
    caller: () => current().principal,
    authState: refresh,
    subscribe(listener: () => void): () => void {
      if (disposed) return () => {}
      ensureAuth()
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    async signIn(signInOptions?: unknown): Promise<void> {
      const source = authFor("signIn")
      try {
        await source.signIn(signInOptions)
      } finally {
        onAuthChange()
      }
    },
    async signOut(signOutOptions?: unknown): Promise<void> {
      const source = authFor("signOut")
      try {
        await source.signOut(signOutOptions)
      } finally {
        onAuthChange()
      }
    },
    dispose(): void {
      if (disposed) return
      disposed = true
      const source = auth
      const unsubscribe = unsubscribeAuth
      auth = undefined
      unsubscribeAuth = undefined
      listeners.clear()
      agents.clear()
      snapshot = notified = ANONYMOUS_STATE
      queryClient.clear()
      unsubscribe?.()
      source?.dispose?.()
    },
  }
  // The stamps and the seam `@ic-reactor/react` reads (see `CLIENTS_CREATED`), defined
  // before the freeze: a frozen object takes no new property. The stamps are
  // not enumerable, so a spread copy of a client has no serial and is not
  // taken for the client it copies. The seam is: a copy (`{ ...client }`, a
  // test's double) keeps it, and its views are made over the copy, whose
  // members are the client's own, so a provider given a copy hydrates as one
  // given the client does.
  const client: Client = Object.freeze(
    Object.defineProperties(members, {
      [CLIENT_SERIAL]: { value: nextSerial() },
      [CLIENT_DISPOSED]: { get: () => disposed },
      [CLIENT_AS]: { value: viewAs, enumerable: true },
    })
  )

  INTERNALS.set(client, internals)
  return client
}
