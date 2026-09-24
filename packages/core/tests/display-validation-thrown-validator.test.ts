/**
 * A validator that throws or rejects (a blocklist lookup that fails, say) was
 * reported three ways. `callMethod()` wrapped it in a `CallError`, while
 * `callMethodWithValidation()` and `validate()` passed the raw error through,
 * so a `TypeError: Failed to fetch` matched none of `isValidationError`,
 * `isCallError` and `isCanisterError`, and a `CanisterError` from a lookup's
 * own canister call passed for the called canister's answer (#593).
 *
 * All three now report it alike: a `CallError` with what the validator threw
 * as `cause`. A `ValidationError` it throws stays a `ValidationError`.
 */
import { describe, it, expect, vi } from "vitest"
import {
  CallError,
  CanisterError,
  ClientManager,
  DisplayReactor,
  ValidationError,
  isCallError,
  isCanisterError,
  isRetryableReactorError,
  isValidationError,
  type Validator,
} from "../src/index.js"
import { IDL } from "@icp-sdk/core/candid"
import { QueryClient } from "@tanstack/query-core"
import type { ActorMethod } from "@icp-sdk/core/agent"

interface TestActor {
  greet: ActorMethod<[string], string>
}

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({
    greet: IDL.Func([IDL.Text], [IDL.Text], ["query"]),
  })

function setup(validator: Validator<[string]>) {
  const reactor = new DisplayReactor<TestActor>({
    name: "thrown-validator",
    idlFactory,
    canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
    clientManager: new ClientManager({ queryClient: new QueryClient() }),
  })
  const executeQuery = vi
    .spyOn(reactor as any, "executeQuery")
    .mockResolvedValue(IDL.encode([IDL.Text], ["Hello, alice"]))
  reactor.registerValidator("greet", validator)
  return { reactor, executeQuery }
}

type EntryPoint = (reactor: DisplayReactor<TestActor>) => Promise<unknown>

const callMethod: EntryPoint = (reactor) =>
  reactor.callMethod({ functionName: "greet", args: ["alice"] })
const callMethodWithValidation: EntryPoint = (reactor) =>
  reactor.callMethodWithValidation({ functionName: "greet", args: ["alice"] })
const validate: EntryPoint = (reactor) => reactor.validate("greet", ["alice"])

/** What an entry point rejected with. */
const rejectionOf = async (call: Promise<unknown>): Promise<unknown> =>
  call.then(
    (value) => {
      throw new Error(`expected a rejection, got ${String(value)}`)
    },
    (error: unknown) => error
  )

const allEntryPoints: Array<[string, EntryPoint]> = [
  ["callMethod()", callMethod],
  ["callMethodWithValidation()", callMethodWithValidation],
  ["validate()", validate],
]

describe("a validator that throws", () => {
  const cause = new TypeError("Failed to fetch")

  it.each(allEntryPoints)(
    "makes %s reject with a CallError whose cause is the thrown error",
    async (_, entryPoint) => {
      const { reactor, executeQuery } = setup(() => {
        throw cause
      })

      const error = await rejectionOf(entryPoint(reactor))

      expect(error).toBeInstanceOf(CallError)
      expect(isCallError(error)).toBe(true)
      expect((error as CallError).cause).toBe(cause)
      expect((error as CallError).message).toBe(
        'Failed to validate the arguments of "greet": Failed to fetch'
      )
      expect(executeQuery).not.toHaveBeenCalled()
    }
  )

  it.each(allEntryPoints)(
    "makes %s report a thrown CanisterError as a CallError, not as the canister's answer",
    async (_, entryPoint) => {
      // The validator's own lookup got an `Err` from its canister. That is
      // not the called method's `Err`.
      const lookupErr = new CanisterError({ NotFound: null })
      const { reactor } = setup(() => {
        throw lookupErr
      })

      const error = await rejectionOf(entryPoint(reactor))

      expect(error).toBeInstanceOf(CallError)
      expect((error as CallError).cause).toBe(lookupErr)
    }
  )

  it.each(allEntryPoints)(
    "makes %s wrap a thrown non-error value too",
    async (_, entryPoint) => {
      const { reactor } = setup(() => {
        throw "lookup timed out"
      })

      const error = await rejectionOf(entryPoint(reactor))

      expect(error).toBeInstanceOf(CallError)
      expect((error as CallError).cause).toBe("lookup timed out")
      expect((error as CallError).message).toBe(
        'Failed to validate the arguments of "greet": lookup timed out'
      )
    }
  )

  it.each(allEntryPoints)(
    "leaves a thrown ValidationError as it is in %s",
    async (_, entryPoint) => {
      // Guard: a ValidationError is a verdict on the arguments, whichever
      // way the validator delivers it.
      const verdict = new ValidationError("greet", [
        { path: [], message: "Not today" },
      ])
      const { reactor } = setup(() => {
        throw verdict
      })

      await expect(entryPoint(reactor)).rejects.toBe(verdict)
    }
  )

  it("is not classified as retryable", async () => {
    // Guard: nothing was sent, so a retry would run the same validator again.
    const { reactor } = setup(() => {
      throw cause
    })

    expect(isRetryableReactorError(await rejectionOf(validate(reactor)))).toBe(
      false
    )
  })
})

describe("an async validator that rejects", () => {
  const asyncEntryPoints = allEntryPoints.filter(
    ([name]) => name !== "callMethod()"
  )

  it.each(asyncEntryPoints)(
    "makes %s reject with a CallError whose cause is the rejection",
    async (_, entryPoint) => {
      const cause = new TypeError("Failed to fetch")
      const { reactor, executeQuery } = setup(async () => {
        throw cause
      })

      const error = await rejectionOf(entryPoint(reactor))

      expect(error).toBeInstanceOf(CallError)
      expect((error as CallError).cause).toBe(cause)
      expect((error as CallError).message).toBe(
        'Failed to validate the arguments of "greet": Failed to fetch'
      )
      expect(executeQuery).not.toHaveBeenCalled()
    }
  )

  it.each(asyncEntryPoints)(
    "leaves a rejected ValidationError as it is in %s",
    async (_, entryPoint) => {
      // Guard, as for a synchronous validator.
      const verdict = new ValidationError("greet", [
        { path: [], message: "Not today" },
      ])
      const { reactor } = setup(async () => {
        throw verdict
      })

      await expect(entryPoint(reactor)).rejects.toBe(verdict)
    }
  )
})

describe("a reactor error from another copy of the package", () => {
  // An app can load two copies of the package (a version range the package
  // manager cannot dedupe), so a validator or a subclass can throw errors of
  // the other copy's classes. `instanceof` fails across copies; the brands
  // the error guards read do not.
  const otherCopy = async () => {
    vi.resetModules()
    return import("../src/errors/index.js")
  }

  it.each(allEntryPoints)(
    "thrown by a validator as a ValidationError is passed on as it is by %s",
    async (_, entryPoint) => {
      const { ValidationError: OtherValidationError } = await otherCopy()
      const verdict = new OtherValidationError("greet", [
        { path: [], message: "Not today" },
      ])
      expect(verdict).not.toBeInstanceOf(ValidationError)
      const { reactor, executeQuery } = setup(() => {
        throw verdict
      })

      const error = await rejectionOf(entryPoint(reactor))

      expect(error).toBe(verdict)
      expect(isValidationError(error)).toBe(true)
      expect(executeQuery).not.toHaveBeenCalled()
    }
  )

  it.each(allEntryPoints.filter(([name]) => name !== "callMethod()"))(
    "rejected by an async validator as a ValidationError is passed on as it is by %s",
    async (_, entryPoint) => {
      const { ValidationError: OtherValidationError } = await otherCopy()
      const verdict = new OtherValidationError("greet", [
        { path: [], message: "Not today" },
      ])
      const { reactor } = setup(async () => {
        throw verdict
      })

      await expect(entryPoint(reactor)).rejects.toBe(verdict)
    }
  )

  it("thrown as a CanisterError by a subclass's transformResult reaches callMethod()'s caller as it is", async () => {
    const { CanisterError: OtherCanisterError } = await otherCopy()
    const answer = new OtherCanisterError({ NotFound: null })
    expect(answer).not.toBeInstanceOf(CanisterError)

    class Unwrapping extends DisplayReactor<TestActor> {
      protected override transformResult(): never {
        throw answer
      }
    }
    const reactor = new Unwrapping({
      name: "other-copy",
      idlFactory,
      canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
      clientManager: new ClientManager({ queryClient: new QueryClient() }),
    })
    vi.spyOn(reactor as any, "executeQuery").mockResolvedValue(
      IDL.encode([IDL.Text], ["Hello, alice"])
    )

    const error = await rejectionOf(
      reactor.callMethod({ functionName: "greet", args: ["alice"] })
    )

    expect(error).toBe(answer)
    expect(isCanisterError(error)).toBe(true)
  })
})
