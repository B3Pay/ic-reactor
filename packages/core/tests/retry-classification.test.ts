import { describe, it, expect } from "vitest"
import {
  CallError,
  CanisterError,
  ValidationError,
  isRetryableReactorError,
  reactorRetry,
} from "../src/errors/index.js"

/**
 * React Query retries every failure three times by default. For canister calls
 * that meant four attempts and seconds of backoff on outcomes that cannot
 * change — measured at 4 attempts / >7s for a deterministic reject, and the
 * same for a Candid encode error that never reached the network at all.
 */
describe("isRetryableReactorError", () => {
  describe("never retries a decided outcome", () => {
    it("does not retry a canister Err variant", () => {
      const err = new CanisterError({ InsufficientFunds: { balance: 0n } })
      expect(isRetryableReactorError(err)).toBe(false)
    })

    it("does not retry a client-side validation failure", () => {
      expect(isRetryableReactorError(new ValidationError("transfer", []))).toBe(
        false
      )
    })

    it("does not retry an encode/decode failure, which never left the client", () => {
      expect(
        isRetryableReactorError(
          new TypeError("Invalid record {owner:principal} argument: 42")
        )
      ).toBe(false)
    })

    it("does not retry a deterministic replica rejection", () => {
      // The real shape, captured from a live reject against the ICP ledger:
      // CallError.cause is a RejectError whose `code` carries the rejectCode.
      const rejected = new CallError("no such method", {
        name: "RejectError",
        kind: "Reject",
        code: { rejectCode: 5 },
      })
      expect(isRetryableReactorError(rejected)).toBe(false)
    })

    it("also reads a flat rejectCode, for a differently shaped cause", () => {
      expect(
        isRetryableReactorError(new CallError("trap", { rejectCode: 5 }))
      ).toBe(false)
    })

    it("does not retry a destination-invalid rejection", () => {
      expect(
        isRetryableReactorError(
          new CallError("bad canister", { code: { rejectCode: 3 } })
        )
      ).toBe(false)
    })
  })

  describe("still retries what a retry could fix", () => {
    it("retries a transport failure, which carries no reject code", () => {
      const network = new CallError("fetch failed", new Error("ECONNRESET"))
      expect(isRetryableReactorError(network)).toBe(true)
    })

    it("retries a SysTransient rejection", () => {
      expect(
        isRetryableReactorError(
          new CallError("busy", { code: { rejectCode: 2 } })
        )
      ).toBe(true)
    })

    it("retries a SysUnknown rejection, whose outcome is genuinely unknown", () => {
      expect(
        isRetryableReactorError(
          new CallError("unknown", { code: { rejectCode: 6 } })
        )
      ).toBe(true)
    })

    it("treats an unrecognised CallError shape as retryable", () => {
      // Fail open: this can only ever remove pointless attempts.
      expect(isRetryableReactorError(new CallError("odd"))).toBe(true)
    })
  })
})

describe("reactorRetry", () => {
  const transient = new CallError("busy", { code: { rejectCode: 2 } })
  const decided = new CanisterError({ InsufficientFunds: null })

  it("keeps React Query's three attempts for retryable failures", () => {
    expect(reactorRetry(0, transient)).toBe(true)
    expect(reactorRetry(2, transient)).toBe(true)
    expect(reactorRetry(3, transient)).toBe(false)
  })

  it("stops immediately on a decided outcome", () => {
    expect(reactorRetry(0, decided)).toBe(false)
  })
})
