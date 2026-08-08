import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
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

    it("does not retry an encode failure, which reaches us wrapped in CallError", () => {
      // The shape production actually produces: Reactor.callMethod wraps every
      // error other than CanisterError/ValidationError in a CallError, so an
      // IDL.encode TypeError arrives as a CallError with a plain-Error cause
      // and no reject code. A bare TypeError never reaches the predicate.
      const wrapped = new CallError(
        'Failed to call method "icrc1_balance_of": Invalid record argument: 42',
        new TypeError("Invalid record {owner:principal} argument: 42")
      )
      expect(isRetryableReactorError(wrapped)).toBe(false)
    })

    it("does not retry a decode failure either", () => {
      const wrapped = new CallError(
        'Failed to call method "icrc1_name": decode error',
        new Error("Invalid nat argument")
      )
      expect(isRetryableReactorError(wrapped)).toBe(false)
    })

    it("does not retry a bare non-CallError", () => {
      expect(isRetryableReactorError(new TypeError("boom"))).toBe(false)
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
        isRetryableReactorError(
          new CallError("trap", { kind: "Reject", rejectCode: 5 })
        )
      ).toBe(false)
    })

    it("does not retry a destination-invalid rejection", () => {
      expect(
        isRetryableReactorError(
          new CallError("bad canister", {
            kind: "Reject",
            code: { rejectCode: 3 },
          })
        )
      ).toBe(false)
    })
  })

  describe("still retries what a retry could fix", () => {
    it("retries a transport failure from the agent", () => {
      // Agent errors expose a `kind`; that is what separates them from our own
      // encode/decode faults, which carry none.
      const network = new CallError("fetch failed", {
        name: "TransportError",
        kind: "Transport",
      })
      expect(isRetryableReactorError(network)).toBe(true)
    })

    it("retries a certificate-verification failure", () => {
      expect(
        isRetryableReactorError(
          new CallError("bad cert", { name: "TrustError", kind: "Trust" })
        )
      ).toBe(true)
    })

    it("retries an agent error whose kind is unfamiliar", () => {
      // Bias toward retrying within agent errors, so an unknown transport-level
      // fault is never silently made fatal.
      expect(
        isRetryableReactorError(new CallError("odd", { kind: "SomethingNew" }))
      ).toBe(true)
    })

    it("retries a SysTransient rejection", () => {
      expect(
        isRetryableReactorError(
          new CallError("busy", { kind: "Reject", code: { rejectCode: 2 } })
        )
      ).toBe(true)
    })

    it("retries a SysUnknown rejection, whose outcome is genuinely unknown", () => {
      expect(
        isRetryableReactorError(
          new CallError("unknown", { kind: "Reject", code: { rejectCode: 6 } })
        )
      ).toBe(true)
    })

    it("does not retry a CallError with no agent error underneath", () => {
      // No `kind` and no reject code means no request was made.
      expect(isRetryableReactorError(new CallError("odd"))).toBe(false)
    })
  })
})

describe("reactorRetry", () => {
  const transient = new CallError("busy", {
    kind: "Reject",
    code: { rejectCode: 2 },
  })
  const decided = new CanisterError({ InsufficientFunds: null })

  describe("in a browser", () => {
    beforeEach(() => {
      vi.stubGlobal("window", {})
    })
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it("keeps React Query's three attempts for retryable failures", () => {
      expect(reactorRetry(0, transient)).toBe(true)
      expect(reactorRetry(2, transient)).toBe(true)
      expect(reactorRetry(3, transient)).toBe(false)
    })

    it("stops immediately on a decided outcome", () => {
      expect(reactorRetry(0, decided)).toBe(false)
    })
  })

  it("does not retry at all on the server", () => {
    // TanStack defaults to zero retries server-side; supplying a predicate
    // overrides that, so a failed prefetch would pick up 1s/2s/4s of backoff.
    expect(typeof window).toBe("undefined")
    expect(reactorRetry(0, transient)).toBe(false)
  })
})
