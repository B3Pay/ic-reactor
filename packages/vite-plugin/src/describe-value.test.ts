import { describe, expect, it } from "vitest"
import { describeError } from "./describe-value.js"

describe("describeError", () => {
  // Node keeps a DOMException's message behind a getter of its class, not on
  // the error: read as an own property only, an AbortError was quoted as
  // `DOMException {}`.
  it("gives the message of a DOMException, as an abort or a timeout throws it", () => {
    expect(
      describeError(
        new DOMException("This operation was aborted", "AbortError")
      )
    ).toBe("This operation was aborted")
    expect(describeError(AbortSignal.abort().reason)).toBe(
      "This operation was aborted"
    )
    expect(
      describeError(
        new DOMException(
          "The operation was aborted due to timeout",
          "TimeoutError"
        )
      )
    ).toBe("The operation was aborted due to timeout")
    expect(describeError(new TypeError("fetch failed"))).toBe("fetch failed")
  })

  // Read through the error, the message of a class that makes it a getter
  // would run that getter: code of the value's.
  it("runs no getter that a class of the error's own makes of its message, and quotes the error instead", () => {
    let read = 0
    class Quiet extends Error {}
    Object.defineProperty(Quiet.prototype, "message", {
      get() {
        read += 1
        return "read"
      },
    })

    expect(describeError(new Quiet())).toBe("Quiet {}")
    expect(read).toBe(0)
  })
})
