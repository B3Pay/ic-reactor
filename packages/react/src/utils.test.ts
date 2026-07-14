import { describe, expect, it } from "vitest"
import { normalizeQueryData } from "./utils"

describe("normalizeQueryData", () => {
  it("uses null for a successful undefined query result", () => {
    expect(normalizeQueryData(undefined)).toBeNull()
  })

  it("preserves defined query results, including nested undefined fields", () => {
    const result = { value: undefined }

    expect(normalizeQueryData(result)).toBe(result)
  })
})
