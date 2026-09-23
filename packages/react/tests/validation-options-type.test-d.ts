/**
 * `mapValidationErrors` is documented as taking `options?: { multiple?: boolean }`
 * and exports `MapValidationErrorsOptions` with that shape, but its overloads
 * took only the literals `{ multiple: true }` and `{ multiple: false }`. Passing
 * a `MapValidationErrorsOptions`, a `{ multiple: boolean }` built from a
 * variable, `{}` or `undefined` failed with TS2769 "No overload matches this
 * call".
 *
 * Checked by `pnpm typecheck` (tests are in the typecheck project), not by
 * vitest.
 */
import { describe, it, expectTypeOf } from "vitest"
import type { ValidationError } from "@ic-reactor/core"
import { mapValidationErrors } from "../src/validation.js"
import type {
  FieldErrors,
  FieldErrorsMultiple,
  MapValidationErrorsOptions,
} from "../src/validation.js"

declare const error: ValidationError
declare const options: MapValidationErrorsOptions
declare const optionalOptions: MapValidationErrorsOptions | undefined
declare const multiple: boolean

describe("mapValidationErrors options", () => {
  it("accepts the exported options type, returning either shape", () => {
    expectTypeOf(mapValidationErrors(error, options)).toEqualTypeOf<
      FieldErrors | FieldErrorsMultiple
    >()
    expectTypeOf(mapValidationErrors(error, optionalOptions)).toEqualTypeOf<
      FieldErrors | FieldErrorsMultiple
    >()
  })

  it("accepts a multiple flag that is not a literal", () => {
    expectTypeOf(mapValidationErrors(error, { multiple })).toEqualTypeOf<
      FieldErrors | FieldErrorsMultiple
    >()
  })

  it("reads {} and undefined as the default, one message per field", () => {
    expectTypeOf(mapValidationErrors(error, {})).toEqualTypeOf<FieldErrors>()
    expectTypeOf(
      mapValidationErrors(error, undefined)
    ).toEqualTypeOf<FieldErrors>()
  })

  it("keeps the literal forms", () => {
    expectTypeOf(mapValidationErrors(error)).toEqualTypeOf<FieldErrors>()
    expectTypeOf(
      mapValidationErrors(error, { multiple: false })
    ).toEqualTypeOf<FieldErrors>()
    expectTypeOf(
      mapValidationErrors(error, { multiple: true })
    ).toEqualTypeOf<FieldErrorsMultiple>()
  })

  it("still rejects an unknown option", () => {
    // @ts-expect-error `multi` is not an option
    mapValidationErrors(error, { multi: true })
  })
})
