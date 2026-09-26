import type {
  ActorMethod,
  ActorSubclass,
  CallConfig,
  PollingOptions,
} from "@icp-sdk/core/agent"
import type { Principal } from "@icp-sdk/core/principal"
import type { QueryKey } from "@tanstack/query-core"
import type { ClientManager } from "../client.js"
import type { Reactor } from "../reactor.js"
import type {
  CallError,
  CanisterError,
  ValidationError,
} from "../errors/index.js"
import type { OkResult, ErrResult } from "./result.js"
import type {
  DisplayOf,
  DisplayResultOf,
  ActorDisplayCodec,
} from "../display/index.js"

export interface DefaultActorType {
  [key: string]: ActorMethod<any, any>
}

export type BaseActor<T = DefaultActorType> = ActorSubclass<T>

export type FunctionName<A = BaseActor> = Extract<keyof A, string>

export type FunctionType = "query" | "update"

export type CanisterId = string | Principal

/**
 * Extract the argument tuple of a service method.
 *
 * `ActorMethod` carries a `withOptions` member as well as a call signature, so a
 * service written with plain function types — `claim: (id: Uint8Array) =>
 * Promise<Result>` instead of `ActorMethod<[Uint8Array], Result>` — does not
 * match it. That used to fall through to `never`, which compiles at the
 * declaration site and then fails at every hook call site with
 * "Type 'Uint8Array[]' is not assignable to type 'undefined'". didc/dfx output
 * always uses `ActorMethod`, so only hand-written or third-party service types
 * hit it, and the error never pointed at the cause.
 *
 * The plain-function fallback below makes both shapes infer identically.
 */

export type ActorMethodParameters<T> =
  T extends ActorMethod<infer Args, any>
    ? Args
    : T extends (...args: infer Args) => Promise<any>
      ? Args
      : never

/**
 * Extract the resolved return type of a service method.
 *
 * Same two shapes as {@link ActorMethodParameters}.
 */

export type ActorMethodReturnType<T> =
  T extends ActorMethod<any, infer Ret>
    ? Ret
    : T extends (...args: any[]) => Promise<infer Ret>
      ? Ret
      : never

export interface ReactorParameters {
  clientManager: ClientManager
  name: string
  idlFactory: (IDL: any) => any
  canisterId?: CanisterId
  /**
   * How update calls poll read_state for their result. The reactor passes
   * this one object to every update call, so a `strategy` here is shared by
   * all of them. Use `createPollingStrategy`, which keeps each request's
   * state apart, or leave `strategy` out to get a fresh `defaultStrategy()`
   * per request. A strategy from `@icp-sdk/core/agent` such as
   * `defaultStrategy()` serves a single request: pass it per call through
   * `callConfig.pollingOptions` instead.
   */
  pollingOptions?: PollingOptions
}

export type ActorMethodType<A, M extends keyof A> = {
  (...args: ActorMethodParameters<A[M]>): Promise<ActorMethodReturnType<A[M]>>
  withOptions: (
    options?: CallConfig
  ) => (
    ...args: ActorMethodParameters<A[M]>
  ) => Promise<ActorMethodReturnType<A[M]>>
}

/**
 * Registry for argument transformations.
 * Users can augment this interface to add custom transforms:
 *
 * @example
 * ```typescript
 * // In your code, augment the module
 * declare module '@ic-reactor/core' {
 *   interface TransformArgsRegistry<T> {
 *     myCustom: MyCustomArgTransform<T>
 *   }
 * }
 * ```
 */
/**
 * Helper to extract arguments type for codecs (unwraps single argument tuples).
 */
export type ArgsType<T> = T extends readonly [infer U]
  ? U
  : T extends readonly []
    ? null
    : T

export interface TransformArgsRegistry<T> {
  candid: T
  display: AsDisplayArgs<T>
}

/**
 * Registry for return type transformations.
 * Users can augment this interface to add custom transforms:
 *
 * @example
 * ```typescript
 * declare module '@ic-reactor/core' {
 *   interface TransformReturnRegistry<T> {
 *     myCustom: MyCustomReturnTransform<T>
 *   }
 * }
 * ```
 */
/* eslint-disable @typescript-eslint/no-unused-vars -- the type parameter is
   not referenced by this declaration, but TypeScript requires every
   declaration of an augmented interface to carry identical type parameters
   (TS2428), so it cannot be renamed to the `_`-prefixed form the rule
   accepts. Verified: renaming yields TS2428 plus TS2304. */
// @ts-expect-error - A is used in module augmentation
export interface TransformReturnRegistry<T, A = BaseActor> {
  candid: T
  // Result position: a blob is exactly `string` (hex). The wider BlobType
  // union stays on the args side, where encode accepts all three forms.
  display: DisplayResultOf<T>
}
/* eslint-enable @typescript-eslint/no-unused-vars */

/**
 * Helper type to transform args array elements using ToDisplay
 */
export type AsDisplayArgs<T> = T extends readonly unknown[]
  ? { [K in keyof T]: DisplayOf<T[K]> }
  : DisplayOf<T>

/**
 * Union of all available transform keys.
 * Automatically includes any user-defined transforms via module augmentation.
 */
export type TransformKey = keyof TransformArgsRegistry<unknown>

/**
 * Apply argument transformation based on the transform key.
 * Looks up the transform in TransformArgsRegistry.
 */
export type ReactorArgs<
  A,
  M extends FunctionName<A>,
  Transform extends TransformKey = "candid",
> = TransformArgsRegistry<ActorMethodParameters<A[M]>>[Transform]

/**
 * Apply return type transformation based on the transform key.
 * Looks up the transform in TransformReturnRegistry.
 */
export type ReactorReturnOk<
  A,
  M extends FunctionName<A>,
  Transform extends TransformKey = "candid",
> = TransformReturnRegistry<OkResult<ActorMethodReturnType<A[M]>>, A>[Transform]

/**
 * Data stored by TanStack Query for a reactor call.
 *
 * TanStack Query reserves `undefined` for a missing cache entry, so successful
 * canister results that contain only `undefined` are represented as `null` at
 * the query boundary. Direct `callMethod` calls keep their original result.
 */
export type ReactorQueryData<T> = 0 extends 1 & T
  ? T
  : [T] extends [void]
    ? null
    : undefined extends T
      ? Exclude<T, undefined> | null
      : T

export type ReactorReturnErr<
  A,
  M extends FunctionName<A>,
  Transform extends TransformKey = "candid",
> =
  | CanisterError<
      TransformReturnRegistry<
        ErrResult<ActorMethodReturnType<A[M]>>,
        A
      >[Transform]
    >
  | CallError
  // A DisplayReactor with a registered validator throws this before the call
  // leaves the client, so it reaches exactly the same catch blocks and hook
  // `error` slots as the other two. Omitting it made those handlers look
  // exhaustive when they were not.
  | ValidationError

/**
 * Helper type for actor method codecs returend by getCodec
 */
export interface ActorMethodCodecs<A, M extends FunctionName<A>> {
  args: ActorDisplayCodec<
    ArgsType<ActorMethodParameters<A[M]>>,
    DisplayOf<ArgsType<ActorMethodParameters<A[M]>>>
  >
  result: ActorDisplayCodec<
    ActorMethodReturnType<A[M]>,
    DisplayResultOf<ActorMethodReturnType<A[M]>>
  >
}

// ══════════════════════════════════════════════════════════════════════════
// REACTOR QUERY PARAMS - Reusable parameter types for reactor methods
// ══════════════════════════════════════════════════════════════════════════

/**
 * Basic query parameters for reactor cache operations.
 * Used by: generateQueryKey, getQueryData
 */
export interface ReactorQueryParams<
  A,
  M extends FunctionName<A>,
  T extends TransformKey = "candid",
> {
  functionName: M
  args?: ReactorArgs<A, M, T>
  queryKey?: QueryKey
}

/**
 * Query parameters with optional call configuration.
 * Used by: getQueryOptions, fetchQuery, callMethod
 */
export interface ReactorCallParams<
  A,
  M extends FunctionName<A>,
  T extends TransformKey = "candid",
> extends ReactorQueryParams<A, M, T> {
  callConfig?: CallConfig
}

// ══════════════════════════════════════════════════════════════════════════
// INSTANCE-INFERRED TYPES - the types above, read off a reactor's own type
// ══════════════════════════════════════════════════════════════════════════

/**
 * The service type of a reactor, read from the reactor's own type. Pass
 * `typeof reactor` for a `Reactor`, a `DisplayReactor` or a subclass of
 * either.
 *
 * Code that has only the reactor in scope, such as a component that imports
 * it, then needs neither the service type exported next to it nor the
 * transform spelled out. {@link ReactorArgsOf}, {@link ReactorDataOf} and
 * {@link ReactorErrorOf} build on it.
 *
 * @typeParam R - The reactor's type, as `typeof reactor`.
 *
 * @example
 * ```typescript
 * const ledger = new DisplayReactor<Ledger>({ clientManager, name: "ledger", idlFactory })
 *
 * // "icrc1_balance_of" | "icrc1_transfer" | ...
 * type LedgerMethod = FunctionName<ServiceOf<typeof ledger>>
 * ```
 */
export type ServiceOf<R extends { readonly _actor: unknown }> = R["_actor"]

/**
 * The transform of a reactor, read from the reactor's own type: `"candid"`
 * for a `Reactor`, `"display"` for a `DisplayReactor`, and the key a subclass
 * passes on, such as a `MetadataReactor`'s `"metadata"`.
 *
 * @typeParam R - The reactor's type, as `typeof reactor`.
 *
 * @example
 * ```typescript
 * const ledger = new DisplayReactor<Ledger>({ clientManager, name: "ledger", idlFactory })
 *
 * type LedgerTransform = TransformOf<typeof ledger> // "display"
 * ```
 */
export type TransformOf<R extends { readonly _actor: unknown }> =
  R extends Reactor<ServiceOf<R>, infer T extends TransformKey> ? T : never

/**
 * The arguments a reactor's method takes, in the reactor's own form: raw
 * Candid values for a `Reactor`, display values (text for a `nat` or a
 * `principal`) for a `DisplayReactor`. It is
 * `ReactorArgs<Service, M, Transform>` with the service and transform read
 * from `typeof reactor`, so neither has to be named.
 *
 * @typeParam R - The reactor's type, as `typeof reactor`.
 * @typeParam M - The method.
 *
 * @example
 * ```typescript
 * const ledger = new DisplayReactor<Ledger>({ clientManager, name: "ledger", idlFactory })
 *
 * // `{ owner: string; subaccount?: ... }`: the account in display form,
 * // derived rather than written out by hand
 * type Account = ReactorArgsOf<typeof ledger, "icrc1_balance_of">[0]
 * ```
 */
export type ReactorArgsOf<
  R extends { readonly _actor: unknown },
  M extends FunctionName<ServiceOf<R>>,
> = ReactorArgs<ServiceOf<R>, M, TransformOf<R>>

/**
 * What a reactor's method resolves with: the `Ok` value of a Candid `Result`,
 * or the whole result of a method that returns none, in the reactor's own
 * form. It is what `callMethod`, a mutation and its `execute()` resolve with,
 * `ReactorReturnOk<Service, M, Transform>` with the service and transform read
 * from `typeof reactor`.
 *
 * The query hooks and factories cache it as
 * `ReactorQueryData<ReactorDataOf<R, M>>`, which is the same type unless the
 * result can be `undefined`: TanStack Query reserves `undefined` for "not
 * cached", so such a result is cached as `null`.
 *
 * @typeParam R - The reactor's type, as `typeof reactor`.
 * @typeParam M - The method.
 *
 * @example
 * ```typescript
 * const ledger = new DisplayReactor<Ledger>({ clientManager, name: "ledger", idlFactory })
 *
 * type Balance = ReactorDataOf<typeof ledger, "icrc1_balance_of"> // string
 * ```
 */
export type ReactorDataOf<
  R extends { readonly _actor: unknown },
  M extends FunctionName<ServiceOf<R>>,
> = ReactorReturnOk<ServiceOf<R>, M, TransformOf<R>>

/**
 * The errors a call of a reactor's method rejects with: a `CanisterError`
 * holding the `Err` value of its Candid `Result` in the reactor's own form, a
 * `CallError` or a `ValidationError`. It is
 * `ReactorReturnErr<Service, M, Transform>` with the service and transform
 * read from `typeof reactor`, and the type a hook's `error` holds.
 *
 * @typeParam R - The reactor's type, as `typeof reactor`.
 * @typeParam M - The method.
 *
 * @example
 * ```typescript
 * const ledger = new DisplayReactor<Ledger>({ clientManager, name: "ledger", idlFactory })
 *
 * type TransferError = ReactorErrorOf<typeof ledger, "icrc1_transfer">
 *
 * function describe(error: TransferError): string {
 *   if (isCanisterError(error)) return error.code // "InsufficientFunds", ...
 *   return error.message
 * }
 * ```
 */
export type ReactorErrorOf<
  R extends { readonly _actor: unknown },
  M extends FunctionName<ServiceOf<R>>,
> = ReactorReturnErr<ServiceOf<R>, M, TransformOf<R>>
