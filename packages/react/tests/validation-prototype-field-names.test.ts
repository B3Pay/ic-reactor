/**
 * A Candid record may name a field `constructor`, `toString` or `__proto__`,
 * and a validator reports issues under those names like any other.
 * `mapValidationErrors` looked each name up on a plain object, found the
 * Object.prototype member of that name, and took the field as already filled:
 * the issue was dropped, so the form showed no error for it, and with
 * `{ multiple: true }` it called `.push` on that member and threw a TypeError.
 */
import { describe, it, expect, vi } from "vitest"
import {
  extractValidationErrors,
  handleValidationError,
  mapValidationErrors,
} from "../src/validation.js"
import { ValidationError } from "@ic-reactor/core"

const error = new ValidationError("deploy", [
  { path: ["constructor"], message: "Constructor arguments are required" },
  { path: ["toString"], message: "Must be text" },
  { path: ["toString"], message: "Must not be empty" },
  { path: ["__proto__"], message: "Invalid prototype" },
  { path: ["owner"], message: "Owner is required" },
])

describe("mapValidationErrors with fields named like Object.prototype members", () => {
  it("keeps the first message of each field", () => {
    expect(Object.entries(mapValidationErrors(error))).toEqual([
      ["constructor", "Constructor arguments are required"],
      ["toString", "Must be text"],
      ["__proto__", "Invalid prototype"],
      ["owner", "Owner is required"],
    ])
  })

  it("collects every message of each field with multiple: true", () => {
    expect(
      Object.entries(mapValidationErrors(error, { multiple: true }))
    ).toEqual([
      ["constructor", ["Constructor arguments are required"]],
      ["toString", ["Must be text", "Must not be empty"]],
      ["__proto__", ["Invalid prototype"]],
      ["owner", ["Owner is required"]],
    ])
  })

  it("hands those fields to extractValidationErrors and handleValidationError", () => {
    const expected = {
      constructor: "Constructor arguments are required",
      toString: "Must be text",
      owner: "Owner is required",
    }
    expect(extractValidationErrors(error)).toMatchObject(expected)

    const setFieldErrors = vi.fn()
    handleValidationError(setFieldErrors)(error)
    expect(setFieldErrors).toHaveBeenCalledWith(
      expect.objectContaining(expected)
    )
  })
})
