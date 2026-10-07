/**
 * The types of the canister surface: what `client.canister()` returns, the
 * targets it takes, and the option objects the builders on the client return.
 *
 * Public: {@link Canister} and {@link CanisterTarget}. The rest are helpers the
 * `Client` interface is written with; the package entry does not export them,
 * and an app never names them: it reads them off a call, such as
 * `client.queryOptions(...)`.
 *
 * Nothing here carries a method's mode. A generated `Actor` type says what a
 * method takes and returns, not whether it is a query or an update, so mode
 * rules (a read built from an update, a certified composite query) are checked
 * when the client builds the call, at run time.
 *
 * @module
 */
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
 * `@candid-core/schema/validate`, which decides at run time: exactly an ok arm
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

/** The variables of method `M` of `A`. */
export type VarsOf<A, M extends keyof A> = Vars<ArgsOf<A[M]>>

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
 */
export type CanisterTarget =
  | {
      readonly id: string
      readonly name?: never
      readonly certified?: boolean
    }
  | {
      readonly name: string
      readonly id?: never
      readonly certified?: boolean
    }

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
 * once, when the run starts (`onMutate`; or, from TanStack Query 5.89,
 * `mutationFn` when an `onMutate` of the app's replaced this one), so a
 * `{ name }` whose `ic_env` cookie entry changes while the update is in
 * flight (a local redeploy) still has the reads of the canister it wrote to
 * invalidated, and not those of the one the cookie names now.
 */
export interface CanisterMutationOptions<V, D, E> {
  /** `['ic-reactor', network, canisterId, method]`. */
  readonly mutationKey: MutationKey
  /**
   * Resolves the canister this run writes to and the reads it invalidates,
   * and returns them; TanStack Query runs it before `mutationFn` and hands
   * what it returns to `onSettled`.
   *
   * `context` is the function context TanStack Query 5.89 and later passes
   * to `onMutate`, `mutationFn` and `onSettled` alike, through which
   * `mutationFn` finds this run. To add an `onMutate` of your own, call this
   * one from it with both arguments, and return its result or spread it
   * into yours: `{ ...options.onMutate(variables, context), previous }`.
   * One that replaces this one instead (TanStack's optimistic-update recipe
   * as written) leaves the resolving to `mutationFn`, which keeps the write
   * and its invalidation together only from 5.89 on.
   */
  readonly onMutate: (variables: V, context?: unknown) => MutationTargets
  /**
   * Calls the method as the caller current when it runs, at the canister
   * `onMutate` resolved for this run.
   *
   * It finds that run through `context`, which TanStack Query passes from
   * 5.89 on. When `onMutate` resolved nothing for that context (an
   * `onMutate` of the app's replaced this one), it resolves the run when it
   * starts and keeps it for `onSettled`, which gets the same context.
   * Without a context (TanStack Query before 5.89, a direct call) it
   * resolves the canister when it starts. Before 5.89 that leaves a gap: a
   * `{ name }` whose cookie entry is rewritten between `onMutate` and
   * `mutationFn` is written to at the new canister while `onSettled`
   * invalidates the old one's reads. TanStack runs the two back to back,
   * with no other task in between, unless the mutation is paused (offline)
   * or waits for its `scope`.
   */
  readonly mutationFn: (variables: V, context?: unknown) => Promise<D>
  /** A mutation is never retried by TanStack: an update re-sent after an unknown outcome can run twice. */
  readonly retry: false
  /**
   * Invalidates the reads the write may have changed, unless the failure
   * proves it changed nothing: the reads resolved for this run. It finds
   * them through `context`, the run's function context (TanStack Query 5.89
   * and later), which holds what `mutationFn` wrote with, or else in
   * `onMutateResult`, what `onMutate` returned. When neither carries the run
   * (before 5.89, an `onMutate` of the app's that replaced this one and
   * returned something else; or a call by hand), it resolves them when it
   * runs. To add an `onSettled` of your own, call this one from it with
   * every argument it gets.
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

/** The fourth argument of `client.queryOptions()`. */
export interface QueryOptionsOptions {
  /**
   * `"idempotent"` lets an `update` method be read like a query. Only for an
   * update that returns the same answer however often it runs, such as
   * ckBTC's `get_btc_address`.
   */
  readonly update: "idempotent"
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
}
