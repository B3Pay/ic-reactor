/**
 * `fromZodSchema` only called `safeParse`, and zod refuses a schema with an
 * async refinement on that path: `validate()` and `callMethodWithValidation()`
 * rejected with zod's "Encountered Promise during synchronous parse" for valid
 * and invalid input alike, so such a schema could not be used at all (#593).
 *
 * `fromZodSchema(schema, { async: true })` parses with `safeParseAsync` and
 * returns an async validator. It runs where async validators run; the
 * synchronous `callMethod()` refuses it as it refuses any async validator.
 */
import { describe, it, expect, vi } from "vitest"
import { z } from "zod"
import {
  CallError,
  ClientManager,
  DisplayReactor,
  ValidationError,
  fromZodSchema,
} from "../src/index.js"
import { IDL } from "@icp-sdk/core/candid"
import { QueryClient } from "@tanstack/query-core"
import type { ActorMethod } from "@icp-sdk/core/agent"

interface TestActor {
  send: ActorMethod<[{ to: string }], string>
}

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({
    send: IDL.Func([IDL.Record({ to: IDL.Text })], [IDL.Text], ["query"]),
  })

const blocked = new Set(["mallory"])
const isBlocked = async (to: string) => {
  await new Promise((resolve) => setTimeout(resolve, 1))
  return blocked.has(to)
}

const recipientSchema = z.object({
  to: z.string().refine(async (to) => !(await isBlocked(to)), {
    message: "Address is blocked",
  }),
})

function setup() {
  const reactor = new DisplayReactor<TestActor>({
    name: "zod-async",
    idlFactory,
    canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
    clientManager: new ClientManager({ queryClient: new QueryClient() }),
  })
  const executeQuery = vi
    .spyOn(reactor as any, "executeQuery")
    .mockResolvedValue(IDL.encode([IDL.Text], ["sent"]))
  reactor.registerValidator(
    "send",
    fromZodSchema(recipientSchema, { async: true })
  )
  return { reactor, executeQuery }
}

describe("fromZodSchema(schema, { async: true })", () => {
  it("accepts valid input through validate()", async () => {
    const { reactor } = setup()

    await expect(reactor.validate("send", [{ to: "alice" }])).resolves.toEqual({
      success: true,
    })
  })

  it("reports the async refinement's issue through validate()", async () => {
    const { reactor } = setup()

    await expect(
      reactor.validate("send", [{ to: "mallory" }])
    ).resolves.toEqual({
      success: false,
      issues: [{ path: ["to"], message: "Address is blocked", code: "custom" }],
    })
  })

  it("lets callMethodWithValidation() call the canister for valid input", async () => {
    const { reactor, executeQuery } = setup()

    await expect(
      reactor.callMethodWithValidation({
        functionName: "send",
        args: [{ to: "alice" }],
      })
    ).resolves.toBe("sent")
    expect(executeQuery).toHaveBeenCalledTimes(1)
  })

  it("makes callMethodWithValidation() throw a ValidationError for invalid input", async () => {
    const { reactor, executeQuery } = setup()

    const call = reactor.callMethodWithValidation({
      functionName: "send",
      args: [{ to: "mallory" }],
    })

    await expect(call).rejects.toThrow(ValidationError)
    await expect(call).rejects.toMatchObject({
      issues: [{ path: ["to"], message: "Address is blocked" }],
    })
    expect(executeQuery).not.toHaveBeenCalled()
  })

  it("is refused by callMethod() as an async validator", async () => {
    const { reactor, executeQuery } = setup()

    const call = reactor.callMethod({
      functionName: "send",
      args: [{ to: "alice" }],
    })

    await expect(call).rejects.toThrow(CallError)
    await expect(call).rejects.toThrow(
      /Async validators are not supported in callMethod\(\): the validator for "send" returned a promise/
    )
    expect(executeQuery).not.toHaveBeenCalled()
  })

  it("needs a schema that can parse asynchronously", () => {
    const syncOnly = {
      safeParse: () => ({ success: true }),
    }

    // Guard for the overloads: `{ async: true }` needs `safeParseAsync`, and
    // a schema that has only `safeParse` still takes the default.
    // @ts-expect-error no safeParseAsync to call
    void fromZodSchema(syncOnly, { async: true })
    expect(fromZodSchema(syncOnly)([{}])).toEqual({ success: true })
  })
})

describe("fromZodSchema(schema) without the option", () => {
  it("still returns its result synchronously", () => {
    // Guard: the default validator is synchronous, so callMethod() and the
    // hooks keep running it.
    const validate = fromZodSchema(z.object({ to: z.string().min(1) }))

    expect(validate([{ to: "" }])).toMatchObject({
      success: false,
      issues: [{ path: ["to"], code: "too_small" }],
    })
    expect(validate([{ to: "alice" }])).toEqual({ success: true })
  })
})
