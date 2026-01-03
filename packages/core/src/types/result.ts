export type UnwrapOkErrResult<T> = T extends { Ok: infer U }
  ? U
  : T extends { ok: infer U }
    ? U
    : T extends { Err: infer E }
      ? E
      : T extends { err: infer E }
        ? E
        : T

/**
 * Extract the Ok value from a Result type.
 * Supports both uppercase (Ok/Err - Rust) and lowercase (ok/err - Motoko).
 * - If T is { Ok: U } or { ok: U }, returns U
 * - If T is { Err: E } or { err: E }, returns never (filters it out from unions)
 * - If T is { Ok: U } | { Err: E }, returns U (the Err variant is filtered out)
 * - Otherwise, returns T as-is
 */
export type OkResult<T> = T extends { Err: unknown }
  ? never
  : T extends { err: unknown }
    ? never
    : T extends { Ok: infer U }
      ? U
      : T extends { ok: infer U }
        ? U
        : T

export type ErrResult<T> = T extends { Ok: unknown }
  ? never
  : T extends { ok: unknown }
    ? never
    : T extends { Err: infer E }
      ? E
      : T extends { err: infer E }
        ? E
        : never

/**
 * Check if T is a Result type ({ Ok: U } | { Err: E } or { ok: U } | { err: E })
 */
export type IsOkErrResultType<T> = T extends { Ok: unknown }
  ? true
  : T extends { ok: unknown }
    ? true
    : T extends { Err: unknown }
      ? true
      : T extends { err: unknown }
        ? true
        : false
