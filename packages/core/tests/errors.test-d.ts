import { describe, expectTypeOf, it } from "vitest"
import {
  isReactorError,
  type ReactorError,
  type ReactorErrorKind,
} from "../src/index.js"
import * as entry from "../src/index.js"

// An `Err` arm shaped like the ICRC-1 ledger's.
type TransferError =
  | { BadFee: { expected_fee: bigint } }
  | { InsufficientFunds: { balance: bigint } }

describe("ReactorErrorKind", () => {
  it("is exactly the eight kinds", () => {
    expectTypeOf<ReactorErrorKind>().toEqualTypeOf<
      | "invalid_args"
      | "unauthenticated"
      | "not_delivered"
      | "outcome_unknown"
      | "rejected"
      | "invalid_reply"
      | "canister_err"
      | "cancelled"
    >()
  })
})

describe("ReactorError", () => {
  it("narrows `err` to the Err arm after a canister_err check", () => {
    const check = (e: ReactorError<TransferError>) => {
      if (e.kind === "canister_err") {
        expectTypeOf(e.err).toEqualTypeOf<TransferError>()
      } else {
        expectTypeOf(e.err).toEqualTypeOf<undefined>()
        expectTypeOf(e.kind).toEqualTypeOf<
          Exclude<ReactorErrorKind, "canister_err">
        >()
      }
    }
    expectTypeOf(check).toBeFunction()
  })

  it("narrows `err` the same way through a switch", () => {
    const describeError = (e: ReactorError<TransferError>): string => {
      switch (e.kind) {
        case "canister_err":
          return "InsufficientFunds" in e.err ? "poor" : "fee"
        default:
          return String(e.err)
      }
    }
    expectTypeOf(describeError).returns.toBeString()
  })

  it("has no `err` for a method without an Err arm", () => {
    expectTypeOf<ReactorError<never>["err"]>().toEqualTypeOf<undefined>()
    expectTypeOf<ReactorError["err"]>().toEqualTypeOf<undefined>()
    expectTypeOf<ReactorError["kind"]>().toEqualTypeOf<ReactorErrorKind>()
  })

  it("is an Error named ReactorError with the fields every kind carries", () => {
    expectTypeOf<ReactorError>().toExtend<Error>()
    expectTypeOf<ReactorError["name"]>().toEqualTypeOf<"ReactorError">()
    expectTypeOf<ReactorError["mayHaveExecuted"]>().toEqualTypeOf<boolean>()
    expectTypeOf<ReactorError["method"]>().toEqualTypeOf<string>()
    expectTypeOf<ReactorError["canisterId"]>().toEqualTypeOf<string>()
    expectTypeOf<ReactorError["code"]>().toEqualTypeOf<string | undefined>()
    expectTypeOf<ReactorError["rejectCode"]>().toEqualTypeOf<
      number | undefined
    >()
    expectTypeOf<ReactorError["httpStatus"]>().toEqualTypeOf<
      number | undefined
    >()
    expectTypeOf<ReactorError["issues"]>().toEqualTypeOf<
      readonly { code: string; path: string; message: string }[] | undefined
    >()
    expectTypeOf<ReactorError["cause"]>().toEqualTypeOf<unknown>()
  })

  it("is readonly", () => {
    const e = {} as ReactorError
    // @ts-expect-error: a ReactorError is not edited after it is thrown.
    e.mayHaveExecuted = true
    // @ts-expect-error: the kind is fixed.
    e.kind = "rejected"
  })

  it("accepts a typed error where the Err arm is wider", () => {
    expectTypeOf<ReactorError<TransferError>>().toExtend<
      ReactorError<unknown>
    >()
    expectTypeOf<ReactorError<TransferError>>().not.toExtend<
      ReactorError<{ Other: null }>
    >()
  })
})

describe("isReactorError", () => {
  it("narrows an unknown value to a ReactorError", () => {
    const catches = (e: unknown) => {
      if (isReactorError(e)) {
        expectTypeOf(e).toEqualTypeOf<ReactorError<unknown>>()
        expectTypeOf(e.mayHaveExecuted).toEqualTypeOf<boolean>()
        if (e.kind === "canister_err") expectTypeOf(e.err).toBeUnknown()
      }
    }
    expectTypeOf(catches).toBeFunction()
  })
})

describe("the package entry", () => {
  it("exports the guard and keeps the classifier out of the types", () => {
    expectTypeOf(entry.isReactorError).toBeFunction()
    expectTypeOf(entry).not.toHaveProperty("classifyError")
    expectTypeOf(entry).not.toHaveProperty("createReactorError")
  })
})
