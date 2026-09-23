import { describe, it, expect, vi, beforeAll } from "vitest"
import { QueryResponseStatus } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { QueryClient } from "@tanstack/query-core"
import {
  CallError,
  CanisterError,
  ValidationError,
  isCallError,
  isCanisterError,
  isRetryableReactorError,
  isValidationError,
} from "../src/errors/index.js"
import type { ClientManager } from "../src/client.js"

/**
 * An app can end up with two copies of @ic-reactor/core: a version range the
 * package manager cannot dedupe (the app pins one patch while
 * @ic-reactor/react asks for a newer one), or a bundler that pre-bundles one
 * importer and not the other. Each copy has its own error classes, and the
 * type guards were plain `instanceof` checks, so a guard from one copy
 * answered `false` for every error the other copy threw.
 *
 * That is not academic: @ic-reactor/react decides whether to run a mutation's
 * `onCanisterError` with `isCanisterError`, and `reactorRetry` decides what to
 * retry with these guards. With the reactor on one copy and the hooks on the
 * other, `onCanisterError` never ran and no transport failure was retried.
 *
 * `vi.resetModules()` makes the next import evaluate the modules again, which
 * gives this test a second, independent copy, as a second bundle would.
 */

let other: typeof import("../src/errors/index.js")
let OtherReactor: typeof import("../src/reactor.js").Reactor

beforeAll(async () => {
  vi.resetModules()
  other = await import("../src/errors/index.js")
  OtherReactor = (await import("../src/reactor.js")).Reactor
})

describe("error type guards across two copies of the package", () => {
  it("really are looking at two copies", () => {
    expect(other.CanisterError).not.toBe(CanisterError)
    expect(new other.CanisterError("x")).not.toBeInstanceOf(CanisterError)
  })

  it("recognise a CanisterError thrown by the other copy's reactor", async () => {
    const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
      IDL.Service({
        transfer: IDL.Func(
          [],
          [IDL.Variant({ Ok: IDL.Nat, Err: IDL.Text })],
          ["query"]
        ),
      })
    const agent = {
      query: vi.fn(async () => ({
        status: QueryResponseStatus.Replied,
        reply: {
          arg: IDL.encode(
            [IDL.Variant({ Ok: IDL.Nat, Err: IDL.Text })],
            [{ Err: "InsufficientFunds" }]
          ),
        },
      })),
    }
    const clientManager = {
      agent,
      queryClient: new QueryClient(),
      registerCanisterId: vi.fn(),
    } as unknown as ClientManager
    const reactor = new OtherReactor({
      clientManager,
      name: "ledger",
      canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
      idlFactory,
    })

    const error = await reactor
      .callMethod({ functionName: "transfer" as never })
      .catch((caught: unknown) => caught)

    expect(isCanisterError(error)).toBe(true)
    expect(isCallError(error)).toBe(false)
  })

  it("recognise the other copy's CallError and ValidationError", () => {
    expect(isCallError(new other.CallError("fetch failed"))).toBe(true)
    expect(isValidationError(new other.ValidationError("transfer", []))).toBe(
      true
    )
  })

  it("retry a transport failure reported through the other copy", () => {
    const transport = new other.CallError('Failed to call method "balance"', {
      name: "TransportError",
      kind: "Transport",
    })

    expect(isRetryableReactorError(transport)).toBe(true)
  })

  it("return the other copy's CanisterError from CanisterError.create as it is", () => {
    const error = new other.CanisterError({ InsufficientFunds: null })

    expect(CanisterError.create(error)).toBe(error)
  })

  it("keep the three kinds apart", () => {
    // Guard: recognising the other copy must not blur what each guard means.
    expect(isCanisterError(new other.CallError("x"))).toBe(false)
    expect(isCallError(new other.CanisterError("x"))).toBe(false)
    expect(isValidationError(new other.CallError("x"))).toBe(false)
    expect(isRetryableReactorError(new other.CanisterError("x"))).toBe(false)
  })

  it("do not accept an object that only looks like one of these errors", () => {
    // Guard: the class name and fields are not what decides.
    const lookalike = Object.assign(new Error("x"), {
      name: "CanisterError",
      err: "x",
      code: "x",
    })
    expect(isCanisterError(lookalike)).toBe(false)
    expect(isCallError({ name: "CallError", message: "x" })).toBe(false)
  })

  it("still recognise their own copy's errors", () => {
    // Guard: the ordinary single-copy case.
    expect(isCanisterError(new CanisterError("x"))).toBe(true)
    expect(isCallError(new CallError("x"))).toBe(true)
    expect(isValidationError(new ValidationError("m", []))).toBe(true)
  })
})
