/**
 * `ValidationError.getIssuesForPath` and `hasErrorForPath` find the issues
 * whose path contains a given segment. They took only a string and compared
 * segments with `===`, but zod reports an array index as a number
 * (`["items", 1, "amount"]`): `"1"` never matched it, and `1` did not compile.
 * The error here comes from a real zod schema run by
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
  fromZodSchema,
  isValidationError,
} from "../src/index.js"
import type { ValidationError } from "../src/index.js"

interface BatchActor {
  batch_transfer: ActorMethod<[{ items: { amount: bigint }[] }], bigint>
}

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({
    batch_transfer: IDL.Func(
      [IDL.Record({ items: IDL.Vec(IDL.Record({ amount: IDL.Nat })) })],
      [IDL.Nat],
      []
    ),
  })

let error: ValidationError

beforeAll(async () => {
  const reactor = new DisplayReactor<BatchActor>({
    name: "batch",
    idlFactory,
    canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
    clientManager: new ClientManager({ queryClient: new QueryClient() }),
  })
  reactor.registerValidator(
    "batch_transfer",
    fromZodSchema(
      z.object({
        items: z.array(
          z.object({ amount: z.string().regex(/^\d+$/, "Must be a number") })
        ),
      })
    )
  )

  const rejection = await reactor
    .callMethodWithValidation({
      functionName: "batch_transfer",
      args: [{ items: [{ amount: "1" }, { amount: "x" }] }],
    })
    .then(
      () => undefined,
      (reason: unknown) => reason
    )
  if (!isValidationError(rejection)) {
    throw new Error("batch_transfer was not refused by its validator")
  }
  error = rejection
})

describe("ValidationError path lookups for an array index", () => {
  it("gets the index from zod as a number", () => {
    expect(error.issues).toEqual([
      expect.objectContaining({
        path: ["items", 1, "amount"],
        message: "Must be a number",
      }),
    ])
  })

  it("finds the issue by the index as a number", () => {
    expect(error.getIssuesForPath(1)).toEqual(error.issues)
    expect(error.hasErrorForPath(1)).toBe(true)
  })

  it("finds the issue by the index as a string", () => {
    expect(error.getIssuesForPath("1")).toEqual(error.issues)
    expect(error.hasErrorForPath("1")).toBe(true)
  })

  it("does not match another index, or a field the path lacks", () => {
    expect(error.getIssuesForPath(0)).toEqual([])
    expect(error.hasErrorForPath("0")).toBe(false)
    expect(error.hasErrorForPath("to")).toBe(false)
  })

  it("still finds the field names", () => {
    expect(error.getIssuesForPath("amount")).toEqual(error.issues)
    expect(error.hasErrorForPath("items")).toBe(true)
  })
})
