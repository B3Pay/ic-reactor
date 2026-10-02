// The handle types: what a method's mode, arguments, data and error become.
import type {
  DataTag,
  MutationFunctionContext,
  QueryFunctionContext,
  QueryKey,
  SkipToken,
} from "@tanstack/query-core"
import type { ReactorError } from "./errors.js"
import type { Textify } from "./principal.js"
import type { ActorShape, ModeMap } from "./service.js"

type ArgsOf<F> = F extends (...args: infer P) => Promise<unknown> ? P : never
type ReplyOf<F> = F extends (...args: never[]) => Promise<infer R> ? R : never
type ArmValue<V> = V extends { value: infer P } ? P : null

type Split<R, OkTag extends string, ErrTag extends string> = [
  Exclude<R, { tag: OkTag } | { tag: ErrTag }>,
] extends [never]
  ? [Extract<R, { tag: OkTag }>] extends [never]
    ? undefined
    : [Extract<R, { tag: ErrTag }>] extends [never]
      ? undefined
      : {
          ok: ArmValue<Extract<R, { tag: OkTag }>>
          err: ArmValue<Extract<R, { tag: ErrTag }>>
        }
  : undefined

/**
 * `{ ok, err }` when the reply is an exactly-two-arm `Ok`/`Err` (or `ok`/`err`)
 * variant — the same rule `isResultSchema` applies at run time — else
 * `undefined`.
 */
type ResultSplit<R> = [R] extends [never]
  ? undefined
  : Split<R, "Ok", "Err"> extends { ok: unknown }
    ? Split<R, "Ok", "Err">
    : Split<R, "ok", "err">

/** The arguments a handle takes: the method's argument tuple, principals as text. */
export type HandleArgs<F> = Textify<ArgsOf<F>>
/** What a handle resolves with: the `Ok` payload for a result method, else the reply. */
export type HandleData<F> =
  ResultSplit<ReplyOf<F>> extends { ok: infer O }
    ? Textify<O>
    : Textify<ReplyOf<F>>
/** The `Err` payload type of a result method; `never` for any other method. */
export type HandleErr<F> =
  ResultSplit<ReplyOf<F>> extends { err: infer E } ? Textify<E> : never

declare const readBrand: unique symbol

/** A handle whose cached data a write can invalidate: a query or composite query. */
export interface ReadHandle {
  readonly [readBrand]: true
  readonly method: string
  readonly canisterId: string
  readonly network: string
}

/** Options for `useQuery`, `queryClient.fetchQuery` and friends. */
export interface HandleQueryOptions<D, E> {
  readonly queryKey: DataTag<QueryKey, D, ReactorError<E>>
  readonly queryFn: ((context: QueryFunctionContext) => Promise<D>) | SkipToken
  readonly retry: (failureCount: number, error: ReactorError<E>) => boolean
}

interface ReadHandleBase<
  A extends readonly unknown[],
  D,
  E,
> extends ReadHandle {
  /** Call the method now, as the current caller. Resolves with the data or throws `ReactorError<E>`. */
  (args: A): Promise<D>
  /** Query options keyed by network, caller principal, canister, method and encoded args. */
  queryOptions(args: A | SkipToken): HandleQueryOptions<D, E>
  /** This method's key for `args`, or the prefix of every key of this method (current caller) without. */
  queryKey(args?: A): QueryKey
}

export interface QueryHandle<
  A extends readonly unknown[],
  D,
  E,
> extends ReadHandleBase<A, D, E> {
  readonly mode: "query"
  /** Run the query as a replicated (update) call, so the reply is certified. Slower. */
  certified(args: A): Promise<D>
}

export interface CompositeQueryHandle<
  A extends readonly unknown[],
  D,
  E,
> extends ReadHandleBase<A, D, E> {
  readonly mode: "composite_query"
}

/** What a write's `mutationOptions` accepts. There is deliberately no `retry`. */
export interface MutationConfig<A, D, E> {
  /**
   * Reads this write can change. They are invalidated after a success, and
   * after a failure whose `mayHaveExecuted` is true (outcome unknown).
   */
  readonly invalidates?: readonly ReadHandle[]
  readonly onSuccess?: (data: D, args: A) => unknown
  readonly onError?: (error: ReactorError<E>, args: A) => unknown
  readonly onSettled?: (
    data: D | undefined,
    error: ReactorError<E> | null,
    args: A
  ) => unknown
}

/** Options for `useMutation`. Retries only a `not_delivered` failure. */
export interface HandleMutationOptions<A, D, E> {
  readonly mutationKey: QueryKey
  readonly mutationFn: (args: A) => Promise<D>
  readonly retry: (failureCount: number, error: ReactorError<E>) => boolean
  readonly onSuccess: (
    data: D,
    args: A,
    onMutateResult: unknown,
    context: MutationFunctionContext
  ) => Promise<void>
  readonly onError: (
    error: ReactorError<E>,
    args: A,
    onMutateResult: unknown,
    context: MutationFunctionContext
  ) => Promise<void>
  readonly onSettled: (
    data: D | undefined,
    error: ReactorError<E> | null,
    args: A,
    onMutateResult: unknown,
    context: MutationFunctionContext
  ) => Promise<void>
}

export interface UpdateHandle<A extends readonly unknown[], D, E> {
  readonly mode: "update" | "oneway"
  readonly method: string
  readonly canisterId: string
  /**
   * Call the method now, as the current caller. Refused before sending
   * (`unauthenticated`) when not signed in. Re-sent only after a
   * `not_delivered` failure.
   */
  (args: A): Promise<D>
  mutationOptions(
    config?: MutationConfig<A, D, E>
  ): HandleMutationOptions<A, D, E>
}

type HandleFor<Mode, F> = Mode extends "query"
  ? QueryHandle<HandleArgs<F> & readonly unknown[], HandleData<F>, HandleErr<F>>
  : Mode extends "composite_query"
    ? CompositeQueryHandle<
        HandleArgs<F> & readonly unknown[],
        HandleData<F>,
        HandleErr<F>
      >
    : UpdateHandle<
        HandleArgs<F> & readonly unknown[],
        HandleData<F>,
        HandleErr<F>
      >

/** One handle per method, typed by the method's mode. */
export type Canister<A extends ActorShape, M extends ModeMap<A>> = {
  readonly [K in keyof M & keyof A & string]: HandleFor<M[K], A[K]>
}
