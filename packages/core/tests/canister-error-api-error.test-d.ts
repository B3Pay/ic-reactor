/**
 * `CanisterError.isApiError()` checks only that `code`, `message` and
 * `details` are present, but narrowed to an `ApiError` declaring
 * `message: string | null | undefined` and
 * `details: Map<string, string> | null | undefined`. Candid decoding produces
 * neither for Orbit's error record: a `Reactor` gives `[] | [string]` and
 * `[] | [Array<[string, string]>]`. So `err.details?.get(...)` and
 * `err.message?.toUpperCase()` type-checked after the guard and threw (#690).
 *
 * `ApiError`'s `message` and `details` are now type parameters defaulting to
 * `unknown`, so the guard claims nothing about them. Its runtime check is
 * unchanged.
 *
 * Checked by `pnpm typecheck` (tests are in the typecheck project), not by
 * vitest.
 */
import { describe, it, expectTypeOf } from "vitest"
import { CanisterError, type ApiError } from "../src/errors/index.js"

declare const value: unknown

describe("CanisterError.isApiError", () => {
  it("narrows message and details to unknown", () => {
    if (CanisterError.isApiError(value)) {
      expectTypeOf(value).toEqualTypeOf<ApiError>()
      expectTypeOf(value.message).toBeUnknown()
      expectTypeOf(value.details).toBeUnknown()

      // @ts-expect-error details is not claimed to be a Map
      void value.details?.get("account_id")
      // @ts-expect-error message is not claimed to be text
      void value.message?.toUpperCase()
    }
  })

  it("still types code as text", () => {
    // The guard does not check this either; the ApiError shape declares it,
    // and CanisterError reads a value as API-shaped only when it is text.
    if (CanisterError.isApiError(value)) {
      expectTypeOf(value.code).toEqualTypeOf<string>()
    }
  })
})

describe("ApiError", () => {
  it("defaults message and details to unknown", () => {
    expectTypeOf<ApiError>().toEqualTypeOf<{
      code: string
      message: unknown
      details: unknown
    }>()
  })

  it("takes the decoded types of an error it knows", () => {
    type RawOrbitError = ApiError<[] | [string], [] | [Array<[string, string]>]>
    const error = new CanisterError<RawOrbitError>({
      code: "NOT_FOUND",
      message: ["Account not found"],
      details: [[["account_id", "abc"]]],
    })

    expectTypeOf(error.err.message).toEqualTypeOf<[] | [string]>()
    expectTypeOf(error.details).toEqualTypeOf<[] | [Array<[string, string]>]>()
  })

  it("keeps an ApiError CanisterError a CanisterError", () => {
    expectTypeOf<CanisterError<ApiError>>().toExtend<CanisterError>()
    expectTypeOf(CanisterError.create).returns.toEqualTypeOf<CanisterError>()
  })
})
