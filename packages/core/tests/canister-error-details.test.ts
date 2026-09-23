import { describe, it, expect, expectTypeOf, beforeEach, vi } from "vitest"
import { QueryClient } from "@tanstack/query-core"
import { QueryResponseStatus } from "@icp-sdk/core/agent"
import type { ActorMethod } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { ClientManager } from "../src/client.js"
import { Reactor } from "../src/reactor.js"
import { DisplayReactor } from "../src/display-reactor.js"
import { CanisterError } from "../src/errors/index.js"
import type { ReactorReturnErr } from "../src/types/reactor.js"

/**
 * `CanisterError.details` was typed `Map<string, string> | null | undefined`,
 * but the constructor copies the `details` field of an error record that has
 * a text `code` exactly as the canister returned it, and Candid decoding never
 * produces a `Map`. Orbit's station answers `variant { Ok; Err : Error }` with
 *
 *   type Error = record {
 *     code : text;
 *     message : opt text;
 *     details : opt vec record { text; text };
 *   };
 *
 * so `details` is `[] | [Array<[string, string]>]` from a Reactor and a plain
 * object (or undefined) from a DisplayReactor. `error.details?.get(...)` type-
 * checked and threw "error.details.get is not a function". The type is now
 * the `details` field's own type, derived from the error value's type.
 *
 * The type assertions here are checked by `pnpm typecheck` (tests are in the
 * typecheck project); vitest runs the runtime ones.
 */

const OrbitError = IDL.Record({
  code: IDL.Text,
  message: IDL.Opt(IDL.Text),
  details: IDL.Opt(IDL.Vec(IDL.Tuple(IDL.Text, IDL.Text))),
})
const GetAccountResult = IDL.Variant({ Ok: IDL.Text, Err: OrbitError })

// ICRC-1's transfer error: a variant, so there is no `code` field to read.
const TransferError = IDL.Variant({
  InsufficientFunds: IDL.Record({ balance: IDL.Nat }),
  GenericError: IDL.Record({ error_code: IDL.Nat, message: IDL.Text }),
})
const TransferResult = IDL.Variant({ Ok: IDL.Nat, Err: TransferError })

interface OrbitErrorView {
  code: string
  message: [] | [string]
  details: [] | [Array<[string, string]>]
}
type TransferErrorView =
  | { InsufficientFunds: { balance: bigint } }
  | { GenericError: { error_code: bigint; message: string } }

interface Service {
  get_account: ActorMethod<[string], { Ok: string } | { Err: OrbitErrorView }>
  icrc1_transfer: ActorMethod<[], { Ok: bigint } | { Err: TransferErrorView }>
}

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({
    get_account: IDL.Func([IDL.Text], [GetAccountResult], ["query"]),
    icrc1_transfer: IDL.Func([], [TransferResult], ["query"]),
  })

const withDetails: OrbitErrorView = {
  code: "NOT_FOUND",
  message: ["Account not found"],
  details: [
    [
      ["account_id", "abc"],
      ["reason", "closed"],
    ],
  ],
}
const withoutDetails: OrbitErrorView = {
  code: "UNAUTHORIZED",
  message: [],
  details: [],
}

describe("CanisterError.details holds the canister's own details value", () => {
  let reply: Uint8Array
  let clientManager: ClientManager

  beforeEach(() => {
    clientManager = new ClientManager({
      queryClient: new QueryClient(),
      agentOptions: { host: "https://icp-api.io" },
    })
    vi.spyOn(clientManager.agent, "query").mockImplementation((async () => ({
      status: QueryResponseStatus.Replied,
      reply: { arg: reply },
    })) as never)
  })

  const reactor = () =>
    new Reactor<Service>({
      clientManager,
      name: "station",
      canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
      idlFactory,
    })
  const displayReactor = () =>
    new DisplayReactor<Service>({
      clientManager,
      name: "station-display",
      canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
      idlFactory,
    })

  async function rejection<T>(call: Promise<unknown>): Promise<T> {
    try {
      await call
    } catch (error) {
      return error as T
    }
    throw new Error("the call did not reject")
  }

  it("is the decoded opt vec from a Reactor, not a Map", async () => {
    reply = IDL.encode([GetAccountResult], [{ Err: withDetails }])

    const error = await rejection<ReactorReturnErr<Service, "get_account">>(
      reactor().callMethod({ functionName: "get_account", args: ["abc"] })
    )
    if (!(error instanceof CanisterError)) throw error

    expect(error.code).toBe("NOT_FOUND")
    expect(error.details).toEqual([
      [
        ["account_id", "abc"],
        ["reason", "closed"],
      ],
    ])
    expect(error.details).not.toBeInstanceOf(Map)
    expect((error.details as { get?: unknown }).get).toBeUndefined()

    expectTypeOf(error.details).toEqualTypeOf<[] | [Array<[string, string]>]>()
    // What the Map type allowed, and what threw.
    // @ts-expect-error an opt vec has no `get`
    expect(() => error.details?.get("account_id")).toThrow(TypeError)
  })

  it("is an empty opt from a Reactor when the canister sent none", async () => {
    reply = IDL.encode([GetAccountResult], [{ Err: withoutDetails }])

    const error = await rejection<ReactorReturnErr<Service, "get_account">>(
      reactor().callMethod({ functionName: "get_account", args: ["abc"] })
    )
    if (!(error instanceof CanisterError)) throw error

    // An empty array, so `if (error.details)` is true without details.
    expect(error.details).toEqual([])
  })

  it("is a plain object from a DisplayReactor, not a Map", async () => {
    reply = IDL.encode([GetAccountResult], [{ Err: withDetails }])

    const error = await rejection<
      ReactorReturnErr<Service, "get_account", "display">
    >(
      displayReactor().callMethod({
        functionName: "get_account",
        args: ["abc"],
      })
    )
    if (!(error instanceof CanisterError)) throw error

    expect(error.code).toBe("NOT_FOUND")
    expect(error.details).toEqual({ account_id: "abc", reason: "closed" })
    expect(error.details).not.toBeInstanceOf(Map)

    expectTypeOf(error.details).toEqualTypeOf<
      Record<string, string> | null | undefined
    >()
    expect(error.details?.["reason"]).toBe("closed")
  })

  it("is undefined from a DisplayReactor when the canister sent none", async () => {
    reply = IDL.encode([GetAccountResult], [{ Err: withoutDetails }])

    const error = await rejection<
      ReactorReturnErr<Service, "get_account", "display">
    >(
      displayReactor().callMethod({
        functionName: "get_account",
        args: ["abc"],
      })
    )
    if (!(error instanceof CanisterError)) throw error

    expect(error.details).toBeUndefined()
  })

  it("is undefined for an error with no text code, such as ICRC-1's", async () => {
    reply = IDL.encode(
      [TransferResult],
      [{ Err: { GenericError: { error_code: 7n, message: "boom" } } }]
    )

    const error = await rejection<ReactorReturnErr<Service, "icrc1_transfer">>(
      reactor().callMethod({ functionName: "icrc1_transfer" })
    )
    if (!(error instanceof CanisterError)) throw error

    expect(error.code).toBe("GenericError")
    expect(error.details).toBeUndefined()
    expectTypeOf(error.details).toEqualTypeOf<undefined>()
  })

  it("keeps a Map that the error value itself carries", () => {
    // A CanisterError built by hand around a Map still types it as one.
    const error = new CanisterError({
      code: "RateLimited",
      message: "Too many requests",
      details: new Map([["retry_after_seconds", "30"]]),
    })

    expectTypeOf(error.details).toEqualTypeOf<Map<string, string>>()
    expect(error.details.get("retry_after_seconds")).toBe("30")
  })

  it("is unknown when the error value's type is", () => {
    expectTypeOf<CanisterError["details"]>().toEqualTypeOf<unknown>()
    expectTypeOf<CanisterError<unknown>["details"]>().toEqualTypeOf<unknown>()
    // Every typed CanisterError is still a CanisterError<unknown>.
    expectTypeOf<CanisterError<OrbitErrorView>>().toExtend<CanisterError>()
    expectTypeOf<CanisterError<TransferErrorView>>().toExtend<CanisterError>()
  })
})
