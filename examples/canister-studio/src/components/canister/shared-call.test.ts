import { serviceMethods } from "@candid-core/schema"
import { encodeArgs } from "@candid-core/schema/codec"
import { QueryClient } from "@tanstack/react-query"
import { describe, expect, it } from "vitest"
import { actor, Account } from "../../canisters/icrc1.ts"
import type { MethodInfo } from "../../interface/types.ts"
import { toHex } from "../../lib/hex.ts"
import {
  decodeSharedArgs,
  MAX_SHARED_ARGS_BYTES,
  methodSearchSchema,
  readsAtOnce,
  readWithin,
} from "./shared-call.ts"

const methods = serviceMethods(actor)

function method(name: string): MethodInfo {
  const found = methods.get(name)
  if (found === undefined) throw new Error(`no ${name}`)
  return found
}

const NNS_GOVERNANCE = "rrkah-fqaaa-aaaaa-aaaaq-cai"

function balanceArgsHex(): string {
  const encoded = encodeArgs(
    [Account],
    [{ owner: NNS_GOVERNANCE, subaccount: null }]
  )
  if (!encoded.ok) throw new Error("does not encode")
  return toHex(encoded.bytes)
}

describe("methodSearchSchema", () => {
  it("reads the spellings the router's JSON parsing produces", () => {
    expect(
      methodSearchSchema.parse({
        method: "icrc1_symbol",
        args: "4449444c0000",
        run: 1,
        certified: "true",
      })
    ).toEqual({
      method: "icrc1_symbol",
      args: "4449444c0000",
      run: true,
      certified: true,
    })
    expect(methodSearchSchema.parse({ run: false, certified: 0 })).toEqual({
      run: false,
      certified: false,
    })
    // A method named like a number arrives as a number.
    expect(methodSearchSchema.parse({ method: 123 }).method).toBe("123")
  })

  it("drops what does not parse instead of failing the page", () => {
    expect(
      methodSearchSchema.parse({
        method: "",
        args: "4449444c000",
        run: "yes",
        certified: { nested: true },
      })
    ).toEqual({})
    expect(methodSearchSchema.parse({ args: "zz" }).args).toBeUndefined()
    const tooLong = "00".repeat(MAX_SHARED_ARGS_BYTES + 1)
    expect(methodSearchSchema.parse({ args: tooLong }).args).toBeUndefined()
  })
})

describe("decodeSharedArgs", () => {
  it("decodes a link's bytes into the method's argument values", () => {
    const shared = decodeSharedArgs(
      method("icrc1_balance_of"),
      balanceArgsHex()
    )
    expect(shared).toEqual({
      ok: true,
      values: [{ owner: NNS_GOVERNANCE, subaccount: null }],
    })
  })

  it("decodes the empty argument list", () => {
    expect(decodeSharedArgs(method("icrc1_symbol"), "4449444c0000")).toEqual({
      ok: true,
      values: [],
    })
  })

  it("says why bytes are unusable", () => {
    const balance = method("icrc1_balance_of")
    expect(decodeSharedArgs(balance, "xyz")).toMatchObject({ ok: false })
    // Valid Candid, but no arguments where an Account is expected.
    const empty = decodeSharedArgs(balance, "4449444c0000")
    expect(empty.ok).toBe(false)
    if (!empty.ok) expect(empty.message).toMatch(/do not decode/)
    const tooLarge = decodeSharedArgs(
      balance,
      "00".repeat(MAX_SHARED_ARGS_BYTES + 1)
    )
    expect(tooLarge).toEqual({
      ok: false,
      message: "The arguments in the link exceed 16 KiB.",
    })
  })
})

describe("readsAtOnce", () => {
  it("reads at once a query with results, and a composite one only uncertified", () => {
    const query = { kind: "read", certifiable: true } as const
    const composite = { kind: "read", certifiable: false } as const
    expect(readsAtOnce(query, false)).toBe(true)
    expect(readsAtOnce(query, true)).toBe(true)
    expect(readsAtOnce(composite, false)).toBe(true)
    expect(readsAtOnce(composite, true)).toBe(false)
  })

  it("never runs a write, an idempotent update or a query without results", () => {
    for (const kind of ["update", "oneway", "idempotent", "call"] as const) {
      expect(readsAtOnce({ kind }, false)).toBe(false)
    }
  })
})

describe("readWithin", () => {
  const key = ["test", "read"] as const

  it("waits for a read that settles in time", async () => {
    const queryClient = new QueryClient()
    await readWithin(
      queryClient,
      key,
      () => queryClient.query({ queryKey: key, queryFn: async () => 42 }),
      1_000
    )
    expect(queryClient.getQueryData(key)).toBe(42)
  })

  it("never throws for a failed read", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    await expect(
      readWithin(
        queryClient,
        key,
        () =>
          queryClient.query({
            queryKey: key,
            queryFn: async () => {
              throw new Error("rejected")
            },
          }),
        1_000
      )
    ).resolves.toBeUndefined()
    expect(queryClient.getQueryState(key)?.status).toBe("error")
  })

  it("cancels a read still running at the deadline", async () => {
    const queryClient = new QueryClient()
    await readWithin(
      queryClient,
      key,
      () =>
        queryClient.query({
          queryKey: key,
          queryFn: ({ signal }) =>
            new Promise<number>((resolve, reject) => {
              const timer = setTimeout(() => resolve(1), 5_000)
              signal.addEventListener("abort", () => {
                clearTimeout(timer)
                reject(signal.reason)
              })
            }),
        }),
      20
    )
    const state = queryClient.getQueryState(key)
    // Not in flight, so the server never sends it half done.
    expect(state?.fetchStatus).toBe("idle")
    expect(state?.data).toBeUndefined()
  })
})
