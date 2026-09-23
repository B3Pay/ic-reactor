/**
 * An issue about the whole argument has an empty path: zod's object-level
 * `.refine()`, or any rule on a primitive argument. React's
 * `mapValidationErrors` files such an issue under `""`, and `getFieldError`
 * finds it there (#592). `ValidationError.getIssuesForPath("")` and
 * `hasErrorForPath("")` did not: they match a path segment, and an empty path
 * has none, so they reported no issue for an error that had one.
 *
 * The errors here come from real zod schemas run by
 * `DisplayReactor.callMethodWithValidation`.
 */
import { beforeAll, describe, it, expect } from "vitest"
import type { ActorMethod } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { QueryClient } from "@tanstack/query-core"
import { z } from "zod"
import {
  ClientManager,
  DisplayReactor,
  ValidationError,
  fromZodSchema,
  isValidationError,
} from "../src/index.js"

interface TransferActor {
  transfer: ActorMethod<[{ from: string; to: string }], bigint>
  set_name: ActorMethod<[string], undefined>
}

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({
    transfer: IDL.Func(
      [IDL.Record({ from: IDL.Text, to: IDL.Text })],
      [IDL.Nat],
      []
    ),
    set_name: IDL.Func([IDL.Text], [], []),
  })

let wholeRecord: ValidationError
let primitive: ValidationError
let mixed: ValidationError

async function refusal(call: () => Promise<unknown>): Promise<ValidationError> {
  const rejection = await call().then(
    () => undefined,
    (reason: unknown) => reason
  )
  if (!isValidationError(rejection)) {
    throw new Error("the call was not refused by its validator")
  }
  return rejection
}

beforeAll(async () => {
  const reactor = new DisplayReactor<TransferActor>({
    name: "transfer",
    idlFactory,
    canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
    clientManager: new ClientManager({ queryClient: new QueryClient() }),
  })
  reactor.registerValidator(
    "transfer",
    fromZodSchema(
      z
        .object({
          from: z.string(),
          to: z.string().min(1, "Recipient is required"),
        })
        .refine((value) => value.from !== value.to, "Cannot send to yourself")
    )
  )
  reactor.registerValidator(
    "set_name",
    fromZodSchema(z.string().min(1, "Name is required"))
  )

  wholeRecord = await refusal(() =>
    reactor.callMethodWithValidation({
      functionName: "transfer",
      args: [{ from: "alice", to: "alice" }],
    })
  )
  primitive = await refusal(() =>
    reactor.callMethodWithValidation({
      functionName: "set_name",
      args: [""],
    })
  )
  // An empty recipient that is also the sender: one field issue, and one
  // about the whole record.
  mixed = await refusal(() =>
    reactor.callMethodWithValidation({
      functionName: "transfer",
      args: [{ from: "", to: "" }],
    })
  )
})

describe('ValidationError lookups for "", an issue about the whole argument', () => {
  it("gets an empty path from zod for an object-level refine and a primitive rule", () => {
    expect(wholeRecord.issues).toEqual([
      expect.objectContaining({ path: [], message: "Cannot send to yourself" }),
    ])
    expect(primitive.issues).toEqual([
      expect.objectContaining({ path: [], message: "Name is required" }),
    ])
  })

  it('finds an object-level refine issue under ""', () => {
    expect(wholeRecord.getIssuesForPath("")).toEqual(wholeRecord.issues)
    expect(wholeRecord.hasErrorForPath("")).toBe(true)
  })

  it('finds a primitive argument\'s issue under ""', () => {
    expect(primitive.getIssuesForPath("")).toEqual(primitive.issues)
    expect(primitive.hasErrorForPath("")).toBe(true)
  })

  it('returns only the whole-argument issue for "", and only the field\'s for the field', () => {
    expect(mixed.issues.map((issue) => issue.path)).toEqual([["to"], []])

    expect(mixed.getIssuesForPath("")).toEqual([
      expect.objectContaining({ message: "Cannot send to yourself" }),
    ])
    expect(mixed.getIssuesForPath("to")).toEqual([
      expect.objectContaining({ message: "Recipient is required" }),
    ])
  })

  it('does not report "" for an error whose issues all name a field', () => {
    // Guard: "" must not become a wildcard.
    const fieldsOnly = new ValidationError("transfer", [
      { path: ["to"], message: "Recipient is required" },
      { path: ["items", 0, "amount"], message: "Must be a number" },
    ])

    expect(fieldsOnly.getIssuesForPath("")).toEqual([])
    expect(fieldsOnly.hasErrorForPath("")).toBe(false)
  })

  it('still matches a segment that is itself ""', () => {
    // Guard: a record field named "" already matched, and still does.
    const emptyKey = new ValidationError("transfer", [
      { path: ["memo", ""], message: "Empty key" },
    ])

    expect(emptyKey.getIssuesForPath("")).toEqual(emptyKey.issues)
    expect(emptyKey.hasErrorForPath("")).toBe(true)
  })
})
