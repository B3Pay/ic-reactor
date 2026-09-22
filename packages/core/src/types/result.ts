/**
 * Whether T is the variant arm tagged K: K is its only key besides the `_type`
 * discriminant a display-transformed variant carries.
 *
 * A Result is a variant, so only an arm counts as one. A record that merely has
 * a field named Ok/ok/Err/err next to other fields is a value like any other,
 * and must not be unwrapped — `extractOkResult` applies the same rule at
 * runtime.
 */
type IsVariantArm<T, K extends PropertyKey> = [
  Exclude<keyof T, K | "_type">,
] extends [never]
  ? true
  : false

export type UnwrapOkErrResult<T> = T extends { Ok: infer U }
  ? IsVariantArm<T, "Ok"> extends true
    ? U
    : T
  : T extends { ok: infer U }
    ? IsVariantArm<T, "ok"> extends true
      ? U
      : T
    : T extends { Err: infer E }
      ? IsVariantArm<T, "Err"> extends true
        ? E
        : T
      : T extends { err: infer E }
        ? IsVariantArm<T, "err"> extends true
          ? E
          : T
        : T

/**
 * Extract the Ok value from a Result type.
 * Supports both uppercase (Ok/Err - Rust) and lowercase (ok/err - Motoko).
 * - If T is { Ok: U } or { ok: U }, returns U
 * - If T is { Err: E } or { err: E }, returns never (filters it out from unions)
 * - If T is { Ok: U } | { Err: E }, returns U (the Err variant is filtered out)
 * - Otherwise, returns T as-is — including a record that has an Ok/ok/Err/err
 *   field among others, which is not a Result
 */
export type OkResult<T> = T extends { Err: unknown }
  ? IsVariantArm<T, "Err"> extends true
    ? never
    : T
  : T extends { err: unknown }
    ? IsVariantArm<T, "err"> extends true
      ? never
      : T
    : T extends { Ok: infer U }
      ? IsVariantArm<T, "Ok"> extends true
        ? U
        : T
      : T extends { ok: infer U }
        ? IsVariantArm<T, "ok"> extends true
          ? U
          : T
        : T

export type ErrResult<T> = T extends { Ok: unknown }
  ? never
  : T extends { ok: unknown }
    ? never
    : T extends { Err: infer E }
      ? IsVariantArm<T, "Err"> extends true
        ? E
        : never
      : T extends { err: infer E }
        ? IsVariantArm<T, "err"> extends true
          ? E
          : never
        : never

/**
 * Check if T is a Result type ({ Ok: U } | { Err: E } or { ok: U } | { err: E })
 */
export type IsOkErrResultType<T> = T extends { Ok: unknown }
  ? IsVariantArm<T, "Ok">
  : T extends { ok: unknown }
    ? IsVariantArm<T, "ok">
    : T extends { Err: unknown }
      ? IsVariantArm<T, "Err">
      : T extends { err: unknown }
        ? IsVariantArm<T, "err">
        : false
