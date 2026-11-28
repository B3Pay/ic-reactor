/**
 * The types of the canister surface: what `client.canister()` returns, the
 * targets it takes, and the option objects the builders on the client return.
 *
 * Public: {@link Canister} and {@link CanisterTarget}. The rest are helpers the
 * `Client` interface is written with; the package entry does not export them,
 * and an app never names them: it reads them off a call, such as
 * `client.queryOptions(...)`.
 *
 * A generated `Actor` type (from `meant gen` 0.5.1) carries each
 * method's mode as `$.WithMode<mode>`. {@link ReadMethod} and
 * {@link OptInMethod} read it, so that `client.queryOptions()` refuses an
 * update or a oneway method at compile time. A method whose mode the type does
 * not say (an `Actor` written by hand) passes, and the client still checks
 * every mode rule when it builds the call, at run time: that check is the only
 * one for such a method, and for a composite query of a certified canister,
 * which no type tells apart.
 *
 * @module
 */
import type { ModeOf } from "@meantjs/schema"
import type {
  DataTag,
  MutationKey,
  QueryFunctionContext,
  QueryKey,
  SkipToken,
} from "@tanstack/query-core"
import type { ReactorError } from "./errors.js"

// ---------------------------------------------------------------------------
// The unwrap rule, as types
// ---------------------------------------------------------------------------

/** An arm's payload: its `value`, or `null` for an arm that carries nothing. */
type ArmPayload<Arm> = Arm extends { value: infer V } ? V : null

/**
 * `{ ok, err }` when `R` is exactly a two-arm variant spelled `Ok`/`Err` (or
 * `ok`/`err` when `OkTag`/`ErrTag` say so), else `never`: an extra arm, a
 * missing one, or a type that is not a variant at all.
 */
type ResultArmsAs<R, OkTag extends string, ErrTag extends string> = [
  Exclude<R, { tag: OkTag } | { tag: ErrTag }>,
] extends [never]
  ? [Extract<R, { tag: OkTag }>] extends [never]
    ? never
    : [Extract<R, { tag: ErrTag }>] extends [never]
      ? never
      : {
          ok: ArmPayload<Extract<R, { tag: OkTag }>>
          err: ArmPayload<Extract<R, { tag: ErrTag }>>
        }
  : never

/**
 * The arms of a result reply, or `never`. Mirrors `isResultSchema` from
 * `@meantjs/schema/validate`, which decides at run time: exactly an ok arm
 * and an err arm, spelled `Ok`/`Err` or `ok`/`err`, never the two mixed. A
 * type test (`tests/canister.test-d.ts`) pins the two to the same answer for
 * the generated fixtures.
 */
type ResultArms<R> = [R] extends [never]
  ? never
  : [ResultArmsAs<R, "Ok", "Err">] extends [never]
    ? ResultArmsAs<R, "ok", "err">
    : ResultArmsAs<R, "Ok", "Err">

/**
 * What a call resolves with for a reply of type `R`: the `Ok` payload when
 * `R` is a result (see {@link ResultArms}), else `R` itself.
 */
export type Unwrap<R> = [ResultArms<R>] extends [never]
  ? R
  : ResultArms<R>["ok"]

/** The `Err` payload of a result reply, or `never` for any other reply. */
export type ErrOf<R> = [ResultArms<R>] extends [never]
  ? never
  : ResultArms<R>["err"]

// ---------------------------------------------------------------------------
// Methods, arguments and replies
// ---------------------------------------------------------------------------

/** The argument tuple of a generated `Actor` method. */
export type ArgsOf<F> = F extends (...args: infer P) => Promise<unknown>
  ? P
  : never

/** The reply type of a generated `Actor` method, before unwrapping. */
export type ReplyOf<F> = F extends (...args: never[]) => Promise<infer R>
  ? R
  : never

/**
 * The variables a builder takes for a method (DECISIONS Q3): nothing for a
 * method without arguments, the value itself for one argument, and the tuple
 * for two or more. `mutate(arg)`, not `mutate([arg])`.
 */
export type Vars<P extends readonly unknown[]> = P extends readonly []
  ? void
  : P extends readonly [infer One]
    ? One
    : P

/**
 * The variables of a method whose type is `any`, as it is when the method is
 * given as `any` (`client.queryOptions<A, any>(canister, method, vars)` for a
 * method named by data): every value but a symbol. The client still applies
 * the run-time rule of {@link Vars} (the value for one argument, the tuple
 * for several, nothing or `[]` for none) and checks the value against the
 * method's schemas when it encodes it.
 *
 * Not `unknown`: `skipToken` is assignable to `unknown`, so a read of such a
 * method would always keep `SkipToken` in its `queryFn` (see
 * {@link QueryArgs}). The cost is that, on this path only, a symbol cannot be
 * given to a method whose one argument is Candid `reserved`.
 */
export type AnyVars =
  string | number | bigint | boolean | object | null | undefined

/**
 * The variables of method `M` of `A`: {@link Vars} of its arguments, or
 * {@link AnyVars} when the method is given as `any`. It checks `M`, which
 * reaches a `Canister<A>` with a generic `A` in `queryOptions`, and the
 * method's type `A[M]`, which reaches the builders that declare
 * `M extends keyof A & string` (under that constraint a check on `M` never
 * takes its `any` branch). With a generic `A`, those builders still see
 * `VarsOf<A, any>` unresolved.
 */
export type VarsOf<A, M extends keyof A> = 0 extends 1 & M
  ? AnyVars
  : 0 extends 1 & A[M]
    ? AnyVars
    : Vars<ArgsOf<A[M]>>

/**
 * The methods of `A` a read may be built from with `{ update: "idempotent" }`:
 * every one not known to be a `oneway`, which has no reply to cache whatever
 * the options say.
 *
 * A method of a generated `Actor` carries its mode (`$.WithMode<"query">`).
 * One written by hand carries none, and `ModeOf` reads it as any of the four,
 * which passes here and is checked at run time.
 */
export type OptInMethod<A> = {
  [K in keyof A & string]: [ModeOf<A[K]>] extends ["oneway"] ? never : K
}[keyof A & string]

/**
 * The methods of `A` a read may be built from without the opt-in: the
 * methods of {@link OptInMethod} not known to be an `update`. For a generated
 * `Actor`, its `query` and `composite_query` methods.
 */
export type ReadMethod<A> = {
  [K in keyof A & string]: K extends OptInMethod<A>
    ? [ModeOf<A[K]>] extends ["update"]
      ? never
      : K
    : never
}[keyof A & string]

/** What method `M` of `A` resolves with. */
export type DataOf<A, M extends keyof A> = Unwrap<ReplyOf<A[M]>>

/** The `Err` payload of method `M` of `A`, or `never`. */
export type ErrorOf<A, M extends keyof A> = ErrOf<ReplyOf<A[M]>>

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Carries the `Actor` type a {@link Canister} was made for, so that the
 * builders infer it from the canister they are given. Type-level only: no
 * canister object has this property.
 */
declare const actorType: unique symbol

/**
 * A canister, as `client.canister<Actor>(actor, target)` returns it: a frozen
 * object with one plain async method per Candid method of the service, typed
 * from the generated `Actor`.
 *
 * Each method encodes its arguments with the service schema, sends the call
 * as the caller signed in at the moment it is called, decodes the reply, and
 * resolves with it the way the generated `Actor` types it: `undefined` for a
 * method with no results, the value for one, the tuple for several. A method
 * whose one result is an `Ok`/`Err` variant resolves with the `Ok` payload and
 * rejects the `Err` one as a `ReactorError` of kind `"canister_err"`, whose
 * `err` is typed.
 *
 * Every failure rejects with a `ReactorError`; read `mayHaveExecuted` before
 * trying a write again. An update re-sends itself only when the failure proves
 * the first attempt never got in (reject code 2, or HTTP 429, from any
 * canister but `aaaaa-aa`), at most twice; a direct read re-sends only after a
 * failure the classifier marks retryable, at most twice.
 *
 * @example
 * ```ts
 * import { actor, type Actor } from "./canisters/icrc1"
 *
 * const ledger = client.canister<Actor>(actor, { id: "ryjl3-tyaaa-aaaaa-aaaba-cai" })
 * const fee = await ledger.icrc1_fee()
 * ```
 */
export type Canister<A> = {
  readonly [K in keyof A]: A[K] extends (...args: infer P) => Promise<infer R>
    ? (...args: P) => Promise<Unwrap<R>>
    : never
} & { readonly [actorType]?: A }

/**
 * Which canister `client.canister()` calls: by its id, or by the name the
 * `ic_env` cookie gives it.
 *
 * - `{ id }`: principal text. Text that is not a canonical principal throws a
 *   `TypeError` that names it, when the canister is made.
 * - `{ name }`: read from the cookie's `PUBLIC_CANISTER_ID:<name>` entry when a
 *   call or a key is built, and only where the network trusts the cookie.
 *   Unresolved (on a server, on an untrusted host, or with no such entry),
 *   every call rejects `invalid_args` with code `"canister_id_unresolved"` and
 *   sends nothing, and keys carry `"$unresolved:<name>"` in place of the id.
 * - `certified: true` makes another canister object, whose `query` methods are
 *   sent as replicated calls so that their replies are certified, and whose
 *   keys end in `"certified"`. A `composite_query` has no certified path: on
 *   such a canister its direct call rejects `invalid_args` (code
 *   `"no_certified_path"`) and `queryOptions` throws a `TypeError`.
 * - `timeoutMs` bounds how long each call made through the canister object
 *   waits for its answer, from the moment it is called: its direct calls, its
 *   reads made with `queryOptions`, its mutations (unless `mutationOptions`
 *   gives its own), and `client.time()` on it. Without it, a request that gets
 *   no HTTP answer waits as long as the `fetch` in use does. When it passes,
 *   the call rejects with code `"timeout"`: `cancelled` with `mayHaveExecuted:
 *   false` for a read, and for a write before its request went out; a write
 *   whose request went out (an `{ update: "idempotent" }` read's included), or
 *   a re-send of a write `client.resendOf()` offered at any point, rejects
 *   `outcome_unknown` with `mayHaveExecuted: true`, an unknown outcome to
 *   reconcile (read the state back, or `client.resendOf()` with this same
 *   canister object), never one to send again blindly. Nothing is sent again
 *   for it, and the request itself is not torn down: only the waiting stops. A
 *   number of milliseconds from 1 to 2147483647; anything else throws a
 *   `TypeError`. Another `timeoutMs` makes another canister object, with the
 *   same keys: a read observed through two of them is bounded by the options
 *   TanStack Query was given last.
 * - `anonymous` names the updates anyone may send (a canister's sign-in
 *   nonce, say): on the canister object it makes, each of them goes out as
 *   the anonymous principal, whoever is signed in and when nobody is,
 *   directly or through `mutationOptions`. `queryOptions` refuses an
 *   `{ update: "idempotent" }` read of one, whose key would hold a caller it
 *   is not sent as. Every other method is called as on any
 *   canister object, so a write nobody named is still refused
 *   (`unauthenticated`) while nobody is signed in. A name the service has no
 *   method for, or one of a `query` or `composite_query` (which a signed-out
 *   client sends already), throws a `TypeError` when the canister is made.
 * - `attributes` makes a canister object whose calls carry signed identity
 *   attributes as their `sender_info`, signed by the caller: what
 *   `client.requestAttributes()` resolved with, for the canister that checks
 *   them and no other. `signer` is the canister that signed them, as
 *   principal text: left out, it is the network's identity provider, which on
 *   mainnet is Internet Identity (`rdmx6-jaaaa-aaaaa-aaadq-cai`); where the
 *   network names none, making the canister without one throws a
 *   `TypeError`. Such a canister object is for direct calls and
 *   `mutationOptions`: `queryOptions` refuses it, since a read made with
 *   attributes would share its key with the one made without. The same
 *   attributes object gives the same canister object. Not together with
 *   `anonymous`.
 */
export type CanisterTarget = (
  | { readonly id: string; readonly name?: never }
  | { readonly name: string; readonly id?: never }
) & {
  readonly certified?: boolean
  readonly timeoutMs?: number
} & (
    | { readonly anonymous?: readonly string[]; readonly attributes?: never }
    | {
        readonly attributes: {
          readonly data: Uint8Array
          readonly signature: Uint8Array
          readonly signer?: string
        }
        readonly anonymous?: never
      }
  )

// ---------------------------------------------------------------------------
// What the builders return
// ---------------------------------------------------------------------------

/**
 * What `client.queryOptions()` returns: plain TanStack Query options for
 * `useQuery`, `queryClient.fetchQuery`, a `QueryObserver` and the like.
 *
 * `D` is the method's data and `E` its `Err` payload. The key is tagged with
 * both, so `queryClient.getQueryData(options.queryKey)` is typed `D` and the
 * query's `error` is `ReactorError<E>`.
 *
 * `S` is what `queryFn` may be besides the query function: `SkipToken` when
 * the variables the options were built from may be `skipToken`, and `never`
 * when they cannot be, so that `useSuspenseQuery` and `useSuspenseQueries`,
 * which take no `skipToken`, accept the options as they are. A compiler
 * message or a hover prints `SkipToken` as `unique symbol`:
 * `CanisterQueryOptions<bigint, never, unique symbol>` is options that may be
 * skipped.
 */
export interface CanisterQueryOptions<D, E, S extends SkipToken = SkipToken> {
  /** `['ic-reactor', network, caller, canisterId, method, args]`, plus `'certified'` for a certified canister. */
  readonly queryKey: DataTag<QueryKey, D, ReactorError<E>>
  /** Calls the method as the caller in the key, or rejects `cancelled` once that caller is no longer current. `skipToken` for a skipped read. */
  readonly queryFn: ((context: QueryFunctionContext) => Promise<D>) | S
  /**
   * Retries only a failure that proves the call was not delivered, at most 3
   * times, never on a server.
   *
   * It takes any error, as `useQueries` and `useSuspenseQueries` type it
   * (they type a query's error from its `throwOnError` alone, `unknown`
   * without one), and its last signature takes `ReactorError<E>`, from which
   * `useQuery` and a `QueryObserver` type the query's `error`.
   */
  readonly retry: ((failureCount: number, error: unknown) => boolean) &
    ((failureCount: number, error: ReactorError<E>) => boolean)
  /** `Infinity` for an update read with `{ update: "idempotent" }`; absent otherwise. */
  readonly staleTime?: number
  /** `false` for an update read with `{ update: "idempotent" }`; absent otherwise. */
  readonly refetchOnMount?: boolean
  /** `false` for an update read with `{ update: "idempotent" }`; absent otherwise. */
  readonly refetchOnWindowFocus?: boolean
  /** `false` for an update read with `{ update: "idempotent" }`; absent otherwise. */
  readonly refetchOnReconnect?: boolean
}

/**
 * Carries the type of what the `onMutate` of `client.mutationOptions()`
 * returns. Type-level only: no object has this property.
 */
declare const mutationTargets: unique symbol

/**
 * What the `onMutate` of `client.mutationOptions()` returns, and TanStack
 * Query hands to its `onSettled`: the canister one run of the mutation writes
 * to and the reads it invalidates, resolved when the run starts. Opaque: pass
 * it on to `onSettled`, or spread it into what an `onMutate` of your own
 * returns.
 */
export interface MutationTargets {
  readonly [mutationTargets]: true
}

/**
 * What `client.mutationOptions()` returns: plain TanStack Query options for
 * `useMutation` or a `MutationObserver`. `V` is the method's variables, `D`
 * its data and `E` its `Err` payload.
 *
 * The canister a run writes to and the reads it invalidates are resolved
 * once, when the run starts (`onMutate`; or `mutationFn` when an `onMutate`
 * of the app's replaced this one), so a `{ name }` whose `ic_env` cookie
 * entry changes while the update is in flight (a local redeploy) still has
 * the reads of the canister it wrote to invalidated, and not those of the
 * one the cookie names now. They are kept by the method of the canister
 * object the options were built from. Options a later render builds from the
 * same canister object find them (`client.canister()` returns the same
 * object for the same arguments). Ones built from another canister object of
 * the same canister, such as one with another `timeoutMs`, resolve both
 * again when their `mutationFn` runs.
 *
 * A run is known by `context`, the function context TanStack Query makes for
 * it and passes to `onMutate`, `mutationFn` and `onSettled` alike, from 5.89
 * on: the oldest release the client supports. On an older one, which passes
 * none, a `mutate()` of these options on the client's own `queryClient`
 * fails with a `TypeError` before anything is sent.
 */
export interface CanisterMutationOptions<V, D, E> {
  /**
   * `['ic-reactor', network, canisterId, method]`; then `"$anonymous"` for a
   * method its canister object names in `anonymous`, or `"$attributes:<n>"`
   * for a canister object made with `attributes` (a number of that object's
   * own, never the attributes); and then the caller for the options of a view
   * `useClient()` returned: a prefix match on the shorter key finds them all.
   * TanStack Query hands a mutation it holds back (offline, or behind its
   * `scope`) the options of a later render only under the same key, so the
   * write is never sent as options that sign another way would send it.
   *
   * A mutation under this key on the client's own `queryClient` is the
   * caller's who made it. When the caller changes (a sign-in, a sign-out, an
   * expired session, a switch of account), the client resets every observer
   * that shows it, so a `useMutation` is idle again, and removes it from the
   * cache: at once when it has settled, else when it settles. A mutation
   * given another `mutationKey` is left alone.
   */
  readonly mutationKey: MutationKey
  /**
   * Resolves the canister this run writes to and the reads it invalidates,
   * and returns them; TanStack Query runs it before `mutationFn` and hands
   * what it returns to `onSettled`.
   *
   * `context` is the run's function context, through which `mutationFn`
   * finds this run. To add an `onMutate` of your own, call this one from it
   * with both arguments, and return its result or spread it into yours:
   * `{ ...options.onMutate(variables, context), previous }`. One that
   * replaces this one instead (TanStack's optimistic-update recipe as
   * written) leaves the resolving to `mutationFn`, which still keeps the
   * write and its invalidation together. On the client's own `queryClient`
   * it keeps the caller too (see `mutationFn`).
   */
  readonly onMutate: (variables: V, context?: unknown) => MutationTargets
  /**
   * Calls the method as the caller current when `mutate()` was called, or
   * not at all: when someone else is current by the time it is sent
   * (TanStack held the write back offline, or behind another mutation of its
   * `scope`, or retried it, and the account was switched meanwhile), it
   * rejects with `kind: "cancelled"`, `code: "caller_changed"`,
   * `mayHaveExecuted: false`, and sends nothing. Built by a view of the
   * client (what `useClient()` returns), it also calls only as the view's
   * principal, and rejects the same way while someone else is current. It
   * calls at the canister `onMutate` resolved for this run.
   *
   * It knows the run by `context`. On the client's own `queryClient`, the
   * caller of each run of this function is read by its `MutationCache` when
   * `mutate()` starts the run, whatever the options' `onMutate` is, so an
   * `onMutate` of the app's that replaces this one keeps the rule. On
   * another `QueryClient` it is the one this `onMutate` read. Refused the
   * same way, because the caller of the run is not known: a mutation
   * TanStack restored from a persister (it runs no `onMutate` for one; call
   * `mutate()` again), and a run on another `QueryClient` whose `onMutate`
   * replaced this one. A call with no context is a call by hand: it goes out
   * as the caller current when it is made.
   *
   * Called again for the same run (TanStack does that for a `retry` of the
   * app's) after an attempt that may have executed, it sends nothing and
   * rejects with `kind: "outcome_unknown"`, `code: "retried_write"`,
   * `mayHaveExecuted: true` and that attempt's error as its `cause`, whoever
   * is current by then: the attempt would go out as a new request, and the
   * canister would run the write a second time. `client.resendOf()` offers
   * the write from that error as from the first. After a failure that proves
   * nothing ran, it sends the attempt. A mutation TanStack restored from a
   * persister after a failed attempt comes with that failure as the
   * persister stored it, and is refused this way unless that copy says
   * `mayHaveExecuted: false`. JSON keeps the field. A structured clone, which
   * a persister on IndexedDB stores, keeps no field of an error, so there a
   * restored mutation that had failed is refused this way whatever the
   * failure was. Not refused: a call by hand, which is a new call each time.
   *
   * Called from a `mutationFn` of the app's own, which is in the options in
   * its place, it keeps both rules when that function hands it the `context`
   * it got: it knows the run by it, whatever argument the app's function
   * makes for the attempt. Who started the run is then what `onMutate` read,
   * on the client's own `queryClient` too, whose `MutationCache` reads the
   * caller only of a run whose `mutationFn` is this one. So with an
   * `onMutate` of the app's that replaced this one as well, the write is
   * refused. A call that resolved holds back no later one: when a later step
   * of the app's function fails and a `retry` runs that function again, the
   * write is sent again. The context stands for the run, and not for one
   * canister or method: handed the context of a run that other options
   * started (those of another canister, or of another method of this one),
   * this function calls at its own canister. It resolves that canister, and
   * the reads its options invalidate, when it is first called for the run,
   * and the `onSettled` of its options finds them by the same context. Two
   * options built for one method of one canister object share what a run
   * resolved, the reads it refreshes included: give them the same
   * `invalidates`. Once a write of such a run has failed with
   * `mayHaveExecuted: true`, every write the run still makes is refused,
   * whichever options it goes through: that `retried_write` names the method
   * and the canister of the write that may have executed, which
   * `isReactorError(error, canister, method)` matches it for, and not those
   * of the call it holds back.
   *
   * Handed no context by such a function, it does not know the run, and the
   * call is one by hand: it goes out as whoever is current by then, and a
   * `retry` sends it again.
   *
   * It finds what `onMutate` resolved through `context`, among the runs of
   * this method of the canister object the options were built from. When
   * nothing was resolved there for that context (an `onMutate` of the app's
   * replaced this one, or a later render built the options of a pending run
   * from another canister object of the same canister), it resolves the run
   * when it starts and keeps it for `onSettled`, which gets the same
   * context. A call by hand resolves the canister when it starts.
   */
  readonly mutationFn: (variables: V, context?: unknown) => Promise<D>
  /**
   * A mutation is never retried by TanStack: an update re-sent after an
   * unknown outcome can run twice. Keep it. With a `retry` of the app's in
   * its place, `mutationFn` refuses the attempt after one that may have
   * executed (`retried_write`).
   */
  readonly retry: false
  /**
   * Invalidates the reads the write may have changed, unless the failure
   * proves it changed nothing: the reads resolved for this run. It finds
   * them through `context`, the run's function context, which holds what
   * `mutationFn` wrote with, or else in `onMutateResult`, what `onMutate`
   * returned. When neither carries the run (a call by hand that passes on
   * neither), it resolves them when it runs. To add an `onSettled` of your
   * own, call this one from it with every argument it gets.
   */
  readonly onSettled: (
    data: D | undefined,
    error: ReactorError<E> | null,
    variables: V,
    onMutateResult?: unknown,
    context?: unknown
  ) => Promise<void>
}

/**
 * The arguments of `client.queryOptions()` after the method: the variables
 * (or `skipToken`), then the options. The variables may be left out for a
 * method without arguments, as in `client.queryOptions(ledger, "icrc1_fee")`.
 * `S` is what may stand in for the variables: `SkipToken`, or `never` for
 * variables that cannot be skipped. Variables of a type `skipToken` is
 * assignable to, such as `unknown` (a method whose one argument is Candid
 * `reserved`) or `{}`, may hold `skipToken` whatever their value, so with `S`
 * `never` they accept nothing: such a read always takes the call with `S`
 * `SkipToken`, and its `queryFn` keeps `SkipToken`.
 */
export type QueryArgs<A, M extends keyof A, S extends SkipToken = SkipToken> = [
  VarsOf<A, M>,
] extends [void]
  ? [vars?: void | S, options?: QueryOptionsOptions]
  : [
      vars: [S] extends [never]
        ? [SkipToken] extends [VarsOf<A, M>]
          ? never
          : VarsOf<A, M>
        : VarsOf<A, M> | S,
      options?: QueryOptionsOptions,
    ]

/**
 * The arguments of `client.queryOptions()` after the method, for a read that
 * opts in with `{ update: "idempotent" }`: the variables of {@link QueryArgs},
 * required, even `undefined` for a method without arguments, then the
 * options.
 */
export type OptInQueryArgs<
  A,
  M extends keyof A,
  S extends SkipToken = SkipToken,
> = [vars: QueryArgs<A, M, S>[0], options: QueryOptionsOptions]

/** The fourth argument of `client.queryOptions()`. */
export interface QueryOptionsOptions {
  /**
   * `"idempotent"` lets an `update` method be read like a query. Only for an
   * update that returns the same answer however often it runs, such as
   * ckBTC's `get_btc_address`.
   */
  readonly update: "idempotent"
}

/**
 * The fourth argument of `client.queryOptions()` for a read walked through
 * its pages. `V` is the method's variables and `D` one page's data.
 */
export interface PagedQueryOptions<V, D> {
  /**
   * The variables of the page after `page`, which was asked for with `vars`,
   * or `undefined` after the last page:
   * `(page) => page.next ?? undefined` for a method that takes a cursor,
   * `(page, [, size]) => page.next === null ? undefined : [page.next, size]`
   * for one that takes a cursor and a page size.
   */
  readonly pages: (page: D, vars: V) => V | undefined
}

/**
 * The arguments of `client.queryOptions()` after the method, for a read
 * walked through its pages with `{ pages }`: the first page's variables of
 * {@link QueryArgs}, then the options. A method without arguments has no
 * second page to ask for, and does not compile.
 */
export type PagedQueryArgs<
  A,
  M extends keyof A,
  S extends SkipToken = SkipToken,
> = [VarsOf<A, M>] extends [void]
  ? never
  : [
      vars: QueryArgs<A, M, S>[0],
      options: PagedQueryOptions<VarsOf<A, M>, DataOf<A, M>>,
    ]

/** The fourth argument of `client.resendOf()`. */
export interface ResendOptions<V> {
  /**
   * What makes the canister answer this argument at most once, read from it:
   * `(arg) => arg.created_at_time` for an ICRC-1 transfer. `undefined` or
   * `null` means the argument carries no such key, and nothing is offered.
   * The client cannot check that the canister deduplicates on it: the app
   * states it.
   */
  readonly dedupedBy: (arg: V) => unknown
}

/**
 * What `client.resendOf()` offers: a write whose outcome is unknown, to send
 * again exactly as it was sent (the same bytes, to the same canister id), and
 * only as whoever sent it.
 */
export interface Resend<V, D> {
  /**
   * The argument the attempt sent: the very object `mutate` or the call was
   * given (the list, for several arguments). `mutate(resend.arg)` sends it
   * again through a mutation, as the same write or not at all: as `from`
   * (else code `caller_changed`), to the method and canister id the attempt
   * went to (else `target_changed`), and while it still encodes to the bytes
   * the attempt sent (else `arg_changed`). A refusal sends nothing and
   * rejects `outcome_unknown`, since the attempt may have run. Do not change
   * it: build a new argument for a new write.
   */
  readonly arg: V
  /** The principal that sent the attempt, as text: the only caller a re-send goes out as. */
  readonly from: string
  /**
   * The Candid bytes the attempt sent, which `send()` sends again. A getter
   * that returns a new copy on every read, so changing it changes nothing
   * that is sent: read it once and keep the copy.
   */
  readonly bytes: Uint8Array
  /**
   * Sends again now the bytes the attempt sent, to the canister id it went
   * to (for `aaaaa-aa`, routed by the same effective canister id), as `from`, whatever became of `arg` or of a `{ name }` since. If
   * someone else is the caller by then, it sends nothing and rejects
   * `outcome_unknown` (code `caller_changed`). Settles as a direct call
   * does, except that a re-send that did not run (refused, or turned away
   * with an HTTP 4xx or reject code 1 to 3) rejects `outcome_unknown` with
   * `mayHaveExecuted: true`: the attempt it re-sends may have run.
   */
  send(): Promise<D>
}

/** A read to invalidate after a write: every read of a canister, or of one of its methods. */
export type InvalidationTarget =
  Canister<object> | readonly [canister: Canister<object>, method: string]

/** The third argument of `client.mutationOptions()`. */
export interface MutationOptionsOptions {
  /**
   * The reads to invalidate after the write settles, for every caller,
   * certified or not. Defaults to every read of the canister written to, an
   * update read with `{ update: "idempotent" }` included (it runs again);
   * `[]` invalidates nothing.
   */
  readonly invalidates?: readonly InvalidationTarget[]
  /**
   * How long each run waits for its answer, in place of the canister
   * target's `timeoutMs`; the same rules. A run whose request went out
   * rejects `outcome_unknown` with `mayHaveExecuted: true` when it passes:
   * reconcile it, never re-send it blindly.
   */
  readonly timeoutMs?: number
}
