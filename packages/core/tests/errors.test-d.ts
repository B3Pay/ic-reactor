import { describe, expectTypeOf, it } from "vitest"
import {
  isReactorError,
  type ReactorError,
  type ReactorErrorKind,
} from "../src/index.js"
import * as entry from "../src/index.js"
import { createClient } from "../src/index.js"
import type { CallMode, ErrorContext } from "../src/errors.js"
import * as icrc1 from "./fixtures/icrc1.js"
import * as shapes from "./fixtures/shapes.js"

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

describe("isReactorError(error, canister, method)", () => {
  const client = createClient({ network: "ic", identity: "anonymous" })
  const ledger = client.canister<icrc1.Actor>(icrc1.actor, {
    id: "ryjl3-tyaaa-aaaaa-aaaba-cai",
  })
  const service = client.canister<shapes.Actor>(shapes.actor, {
    id: "rrkah-fqaaa-aaaaa-aaaaq-cai",
  })

  it("narrows to the method's Err arm: `err` is typed after a canister_err check", () => {
    const catches = (e: unknown) => {
      if (isReactorError(e, ledger, "icrc1_transfer")) {
        expectTypeOf(e).toEqualTypeOf<ReactorError<icrc1.TransferError>>()
        if (e.kind === "canister_err") {
          expectTypeOf(e.err).toEqualTypeOf<icrc1.TransferError>()
        } else {
          expectTypeOf(e.err).toEqualTypeOf<undefined>()
        }
      }
    }
    expectTypeOf(catches).toBeFunction()
  })

  it("reads a result spelled ok/err the same way", () => {
    const catches = (e: unknown) => {
      if (isReactorError(e, service, "outcome") && e.kind === "canister_err") {
        expectTypeOf(e.err).toEqualTypeOf<string>()
      }
    }
    expectTypeOf(catches).toBeFunction()
  })

  it("narrows a method without an Err arm to ReactorError, whose `err` is undefined", () => {
    const catches = (e: unknown) => {
      if (isReactorError(e, ledger, "icrc1_fee")) {
        expectTypeOf(e).toEqualTypeOf<ReactorError>()
        if (e.kind === "canister_err") {
          expectTypeOf(e.err).toEqualTypeOf<undefined>()
        }
      }
      if (isReactorError(e, service, "three") && e.kind === "canister_err") {
        // Ok, Err and a third arm: not a result, so there is no Err arm.
        expectTypeOf(e.err).toEqualTypeOf<undefined>()
      }
    }
    expectTypeOf(catches).toBeFunction()
  })

  it("takes only the canister's own methods, and a canister", () => {
    const e: unknown = undefined
    // @ts-expect-error icrc1_balance is not a method of the ledger
    isReactorError(e, ledger, "icrc1_balance")
    // @ts-expect-error outcome is a method of the shapes service, not of the ledger
    isReactorError(e, ledger, "outcome")
    // @ts-expect-error the method goes with its canister
    isReactorError(e, ledger)
    expectTypeOf(isReactorError).toBeFunction()
  })

  it("keeps the one-argument form", () => {
    const catches = (e: unknown) => {
      if (isReactorError(e)) {
        expectTypeOf(e).toEqualTypeOf<ReactorError<unknown>>()
      }
    }
    expectTypeOf(catches).toBeFunction()
  })
})

describe("ErrorContext", () => {
  type Call = { method: string; canisterId: string }

  it("makes an update say whether the request may already be in the IC", () => {
    // Forgetting `accepted` would read a late HTTP refusal as "never
    // delivered" and re-send an update that is already running.
    expectTypeOf<Call & { mode: "update" }>().not.toExtend<ErrorContext>()
    expectTypeOf<
      Call & { mode: "update"; accepted: boolean }
    >().toExtend<ErrorContext>()
  })

  it("asks nothing more of a query", () => {
    expectTypeOf<Call & { mode: "query" }>().toExtend<ErrorContext>()
  })

  it("accepts a call whose mode is only known at run time, once it says `accepted`", () => {
    expectTypeOf<
      Call & { mode: CallMode; accepted: boolean }
    >().toExtend<ErrorContext>()
    expectTypeOf<Call & { mode: CallMode }>().not.toExtend<ErrorContext>()
  })
})

describe("the package entry", () => {
  it("exports the guard and keeps the classifier out of the types", () => {
    expectTypeOf(entry.isReactorError).toBeFunction()
    expectTypeOf(entry).not.toHaveProperty("classifyError")
    expectTypeOf(entry).not.toHaveProperty("createReactorError")
  })
})
