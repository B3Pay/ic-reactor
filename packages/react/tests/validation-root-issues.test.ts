/**
 * A validator can report an issue about the whole argument rather than one of
 * its fields. zod gives such an issue an empty path: an object-level
 * `.refine()` does, and so does every issue of a primitive argument
 * (`fromZodSchema(z.string().min(1))` for a `text` parameter).
 * `mapValidationErrors` files it under `""`, but `getFieldError` and
 * `getFieldErrors` compared `String(path[0])`, which is `"undefined"` for an
 * empty path: looking up `""` found nothing, and looking up `"undefined"`
 * returned the whole-argument message.
 */
import { describe, it, expect } from "vitest"
import { ValidationError } from "@ic-reactor/core"
import {
  getFieldError,
  getFieldErrors,
  mapValidationErrors,
} from "../src/validation.js"

// The issues `fromZodSchema` returns (zod 4.6.2) for
//   z.object({ username: z.string().min(3, "At least 3 characters"),
//              password: z.string(), confirm: z.string() })
//     .refine((d) => d.password === d.confirm, "Passwords must match")
//     .refine((d) => d.password !== d.username,
//             "Password must differ from the username")
// given { username: "al", password: "al", confirm: "x" }.
const error = new ValidationError("register", [
  { path: ["username"], message: "At least 3 characters", code: "too_small" },
  { path: [], message: "Passwords must match", code: "custom" },
  {
    path: [],
    message: "Password must differ from the username",
    code: "custom",
  },
])

describe("validation issues with an empty path", () => {
  it("are filed under the empty field name by mapValidationErrors", () => {
    expect(mapValidationErrors(error)).toEqual({
      username: "At least 3 characters",
      "": "Passwords must match",
    })
    expect(mapValidationErrors(error, { multiple: true })).toEqual({
      username: ["At least 3 characters"],
      "": ["Passwords must match", "Password must differ from the username"],
    })
  })

  it("are found by getFieldError under that name", () => {
    expect(getFieldError(error, "")).toBe("Passwords must match")
  })

  it("are found by getFieldErrors under that name", () => {
    expect(getFieldErrors(error, "")).toEqual([
      "Passwords must match",
      "Password must differ from the username",
    ])
  })

  it("are not reported for a field named undefined", () => {
    expect(getFieldError(error, "undefined")).toBeUndefined()
    expect(getFieldErrors(error, "undefined")).toEqual([])
  })
})
