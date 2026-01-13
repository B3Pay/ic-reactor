import type {
  ActorMethod,
  ActorSubclass,
  CallConfig,
  ActorConfig,
} from "@icp-sdk/core/agent"
import type { Principal } from "@icp-sdk/core/principal"
import type { QueryKey } from "@tanstack/query-core"
import type { ClientManager } from "../client"
import type { CallError, CanisterError } from "../errors"
import type { OkResult, ErrResult } from "./result"
import type { DisplayOf, ActorDisplayCodec } from "../display"

export interface DefaultActorType {
  [key: string]: ActorMethod<any, any>
}

export type BaseActor<T = DefaultActorType> = ActorSubclass<T>

export type FunctionName<A = BaseActor> = Extract<keyof A, string>

export type FunctionType = "query" | "update"

export type CanisterId = string | Principal

// Extracts the argument types of an ActorMethod
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ActorMethodParameters<T> =
  T extends ActorMethod<infer Args, any> ? Args : never

// Extracts the return type of an ActorMethod
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ActorMethodReturnType<T> =
  T extends ActorMethod<any, infer Ret> ? Ret : never

export interface ReactorParameters extends Omit<
  ActorConfig,
  "agent" | "effectiveCanisterId" | "canisterId"
> {
  clientManager: ClientManager
  name: string
  idlFactory: (IDL: any) => any
  canisterId?: CanisterId
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
export interface TransformReturnRegistry<T> {
  candid: T
  display: DisplayOf<T>
}

/**
 * Helper type to transform args array elements using ToDisplay
 */
type AsDisplayArgs<T> = T extends readonly unknown[]
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
> = TransformReturnRegistry<OkResult<ActorMethodReturnType<A[M]>>>[Transform]

export type ReactorReturnErr<
  A,
  M extends FunctionName<A>,
  Transform extends TransformKey = "candid",
> =
  | CanisterError<
      TransformReturnRegistry<ErrResult<ActorMethodReturnType<A[M]>>>[Transform]
    >
  | CallError

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
    DisplayOf<ActorMethodReturnType<A[M]>>
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
