/**
 * A method that takes no arguments is called without `args` -- that is how the
 * docs, the query hooks and `createQuery` call one -- and `[]` is what gets
 * encoded for it. The validator used to run only when `args` was present, so a
 * validator registered for such a method never ran and every call reached the
 * canister, through `callMethodWithValidation()` as well.
 */
import { describe, it, expect, vi } from "vitest"
import {
  CallError,
  ClientManager,
  DisplayReactor,
  ValidationError,
  type ValidationResult,
} from "../src/index.js"
import { IDL } from "@icp-sdk/core/candid"
import { QueryClient } from "@tanstack/query-core"
import type { ActorMethod } from "@icp-sdk/core/agent"

interface TestActor {
  claim: ActorMethod<[], string>
  stats: ActorMethod<[], bigint>
  greet: ActorMethod<[string], string>
}

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({
    claim: IDL.Func([], [IDL.Text], []),
    stats: IDL.Func([], [IDL.Nat], ["query"]),
    greet: IDL.Func([IDL.Text], [IDL.Text], ["query"]),
  })

const refuse = (): ValidationResult => ({
  success: false,
  issues: [{ path: [], message: "Not eligible" }],
})

function setup() {
  const clientManager = new ClientManager({
    queryClient: new QueryClient({
      defaultOptions: { queries: { retry: false } },
    }),
  })
  const reactor = new DisplayReactor<TestActor>({
    name: "zero-arg",
    idlFactory,
    canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
    clientManager,
  })
  const executeCall = vi
    .spyOn(reactor as any, "executeCall")
    .mockResolvedValue(IDL.encode([IDL.Text], ["claimed"]))
  const executeQuery = vi
    .spyOn(reactor as any, "executeQuery")
    .mockResolvedValue(IDL.encode([IDL.Nat], [5n]))
  return { reactor, executeCall, executeQuery }
}

describe("a validator for a method that takes no arguments", () => {
  it("runs when callMethod() omits args", async () => {
    const { reactor, executeCall } = setup()
    const validator = vi.fn(refuse)
    reactor.registerValidator("claim", validator)

    await expect(reactor.callMethod({ functionName: "claim" })).rejects.toThrow(
      ValidationError
    )
    expect(validator).toHaveBeenCalledWith([])
    expect(executeCall).not.toHaveBeenCalled()
  })

  it("runs when callMethodWithValidation() omits args", async () => {
    const { reactor, executeCall } = setup()
    const validator = vi.fn(async () => refuse())
    reactor.registerValidator("claim", validator)

    await expect(
      reactor.callMethodWithValidation({ functionName: "claim" })
    ).rejects.toThrow(ValidationError)
    expect(validator).toHaveBeenCalledWith([])
    expect(executeCall).not.toHaveBeenCalled()
  })

  it("runs when fetchQuery() omits args", async () => {
    const { reactor, executeQuery } = setup()
    reactor.registerValidator("stats", refuse)

    await expect(reactor.fetchQuery({ functionName: "stats" })).rejects.toThrow(
      ValidationError
    )
    expect(executeQuery).not.toHaveBeenCalled()
  })

  it("runs once and lets the call through when it accepts", async () => {
    const { reactor, executeCall } = setup()
    const validator = vi.fn(async (): Promise<ValidationResult> => ({
      success: true,
    }))
    reactor.registerValidator("claim", validator)

    await expect(
      reactor.callMethodWithValidation({ functionName: "claim" })
    ).resolves.toBe("claimed")
    expect(validator).toHaveBeenCalledTimes(1)
    expect(executeCall).toHaveBeenCalledTimes(1)
  })

  // Omitting args for a method that takes some never encodes, so that call
  // keeps failing the way it always has, without its validator being handed
  // an argument list the method cannot take.
  it("is still skipped for a method that takes arguments", async () => {
    const { reactor, executeQuery } = setup()
    const validator = vi.fn(refuse)
    reactor.registerValidator("greet", validator)

    await expect(reactor.callMethod({ functionName: "greet" })).rejects.toThrow(
      CallError
    )
    expect(validator).not.toHaveBeenCalled()
    expect(executeQuery).not.toHaveBeenCalled()
  })
})
