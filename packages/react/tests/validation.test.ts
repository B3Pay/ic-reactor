import { describe, it, expect, vi } from "vitest"
import {
  mapValidationErrors,
  getFieldError,
  getFieldErrors,
  extractValidationErrors,
  handleValidationError,
  isValidationError,
} from "../src/validation"
import { ValidationError } from "@ic-reactor/core"

describe("Validation Utilities", () => {
  const createTestError = () =>
    new ValidationError("transfer", [
      { path: ["to"], message: "Recipient is required" },
      { path: ["amount"], message: "Amount must be positive" },
      { path: ["amount"], message: "Amount must be a number" },
    ])

  describe("mapValidationErrors", () => {
    it("should map issues to first error per field", () => {
      const error = createTestError()
      const result = mapValidationErrors(error)

      expect(result).toEqual({
        to: "Recipient is required",
        amount: "Amount must be positive", // First error only
      })
    })

    it("should map issues to all errors per field with multiple: true", () => {
      const error = createTestError()
      const result = mapValidationErrors(error, { multiple: true })

      expect(result).toEqual({
        to: ["Recipient is required"],
        amount: ["Amount must be positive", "Amount must be a number"],
      })
    })
  })

  describe("getFieldError", () => {
    it("should return first error for a field", () => {
      const error = createTestError()

      expect(getFieldError(error, "to")).toBe("Recipient is required")
      expect(getFieldError(error, "amount")).toBe("Amount must be positive")
    })

    it("should return undefined for unknown field", () => {
      const error = createTestError()

      expect(getFieldError(error, "unknown")).toBeUndefined()
    })
  })

  describe("getFieldErrors", () => {
    it("should return all errors for a field", () => {
      const error = createTestError()

      expect(getFieldErrors(error, "to")).toEqual(["Recipient is required"])
      expect(getFieldErrors(error, "amount")).toEqual([
        "Amount must be positive",
        "Amount must be a number",
      ])
    })

    it("should return empty array for unknown field", () => {
      const error = createTestError()

      expect(getFieldErrors(error, "unknown")).toEqual([])
    })
  })

  describe("extractValidationErrors", () => {
    it("should extract field errors from ValidationError", () => {
      const error = createTestError()
      const result = extractValidationErrors(error)

      expect(result).toEqual({
        to: "Recipient is required",
        amount: "Amount must be positive",
      })
    })

    it("should return null for non-ValidationError", () => {
      const error = new Error("Some other error")
      const result = extractValidationErrors(error)

      expect(result).toBeNull()
    })

    it("should return null for non-Error", () => {
      expect(extractValidationErrors("string error")).toBeNull()
      expect(extractValidationErrors(null)).toBeNull()
      expect(extractValidationErrors(undefined)).toBeNull()
    })
  })

  describe("handleValidationError", () => {
    it("should call setFieldErrors for ValidationError", () => {
      const setFieldErrors = vi.fn()
      const handler = handleValidationError(setFieldErrors)
      const error = createTestError()

      handler(error)

      expect(setFieldErrors).toHaveBeenCalledWith({
        to: "Recipient is required",
        amount: "Amount must be positive",
      })
    })

    it("should call onOtherError for non-ValidationError", () => {
      const setFieldErrors = vi.fn()
      const onOtherError = vi.fn()
      const handler = handleValidationError(setFieldErrors, onOtherError)
      const error = new Error("Some other error")

      handler(error)

      expect(setFieldErrors).not.toHaveBeenCalled()
      expect(onOtherError).toHaveBeenCalledWith(error)
    })

    it("should not call onOtherError if not provided", () => {
      const setFieldErrors = vi.fn()
      const handler = handleValidationError(setFieldErrors)
      const error = new Error("Some other error")

      // Should not throw
      expect(() => handler(error)).not.toThrow()
      expect(setFieldErrors).not.toHaveBeenCalled()
    })
  })

  describe("isValidationError", () => {
    it("should return true for ValidationError", () => {
      const error = createTestError()
      expect(isValidationError(error)).toBe(true)
    })

    it("should return false for other errors", () => {
      expect(isValidationError(new Error("test"))).toBe(false)
      expect(isValidationError(null)).toBe(false)
      expect(isValidationError("string")).toBe(false)
    })
  })
})
