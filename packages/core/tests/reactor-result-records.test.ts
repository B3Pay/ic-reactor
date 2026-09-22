import { describe, it, expect, expectTypeOf, beforeEach, vi } from "vitest"
import { QueryClient } from "@tanstack/query-core"
import { QueryResponseStatus } from "@icp-sdk/core/agent"
import type { ActorMethod } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { ClientManager } from "../src/client.js"
import { Reactor } from "../src/reactor.js"
import { DisplayReactor } from "../src/display-reactor.js"
import { CanisterError } from "../src/errors/index.js"
import { extractOkResult } from "../src/utils/helper.js"
import type { ReactorReturnOk } from "../src/types/reactor.js"

const Health = IDL.Record({ ok: IDL.Bool, message: IDL.Text })
const Lookup = IDL.Record({ err: IDL.Opt(IDL.Text), value: IDL.Nat })
const TransferResult = IDL.Variant({ Ok: IDL.Nat, Err: IDL.Text })
const MotokoResult = IDL.Variant({ ok: IDL.Nat, err: IDL.Text })

interface HealthView {
  ok: boolean
  message: string
}
interface LookupView {
  err: [] | [string]
  value: bigint
}

interface Service {
  health: ActorMethod<[], HealthView>
  lookup: ActorMethod<[], LookupView>
  transfer: ActorMethod<[], { Ok: bigint } | { Err: string }>
  motoko: ActorMethod<[], { ok: bigint } | { err: string }>
}

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({
    health: IDL.Func([], [Health], ["query"]),
    lookup: IDL.Func([], [Lookup], ["query"]),
    transfer: IDL.Func([], [TransferResult], ["query"]),
    motoko: IDL.Func([], [MotokoResult], ["query"]),
  })

/**
 * Reactor unwraps a canister's Result: `{ Ok: T }` resolves to T and
 * `{ Err: E }` throws a CanisterError. It recognised a Result by the presence
 * of an Ok/ok/Err/err key, so a RECORD that merely has a field of that name
 * was unwrapped too — at runtime and in `ReactorReturnOk`:
 *
 * - `record { ok : bool; message : text }` resolved to the bare `true`, and
 *   `message` was unreachable;
 * - `record { err : opt text; value : nat }` threw `CanisterError: []` on every
 *   SUCCESSFUL call (err = null), so the method could not be used at all.
 *
 * A Result is a variant: one arm key, plus the `_type` discriminant a
 * display-transformed variant carries.
 */
describe("Result unwrapping and records with ok/err fields", () => {
  let reactor: Reactor<Service>
  const replies: Record<string, Uint8Array> = {
    health: IDL.encode([Health], [{ ok: true, message: "all good" }]),
    lookup: IDL.encode([Lookup], [{ err: [], value: 42n }]),
    transfer: IDL.encode([TransferResult], [{ Ok: 5n }]),
    motoko: IDL.encode([MotokoResult], [{ err: "boom" }]),
  }

  beforeEach(() => {
    const clientManager = new ClientManager({
      queryClient: new QueryClient(),
      agentOptions: { host: "https://icp-api.io" },
    })
    vi.spyOn(clientManager.agent, "query").mockImplementation((async (
      _canisterId: unknown,
      { methodName }: { methodName: string }
    ) => ({
      status: QueryResponseStatus.Replied,
      reply: { arg: replies[methodName] },
    })) as never)
    reactor = new Reactor<Service>({
      clientManager,
      name: "service",
      canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
      idlFactory,
    })
  })

  it("returns a record with an `ok` field whole", async () => {
    await expect(
      reactor.callMethod({ functionName: "health" })
    ).resolves.toEqual({ ok: true, message: "all good" })
  })

  it("does not throw for a record with an `err` field", async () => {
    await expect(
      reactor.callMethod({ functionName: "lookup" })
    ).resolves.toEqual({ err: [], value: 42n })
  })

  it("returns such a record whole from a DisplayReactor too", async () => {
    // DisplayReactor unwraps through the same helper, after its codec.
    const display = new DisplayReactor<Service>({
      clientManager: reactor.clientManager,
      name: "service-display",
      canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
      idlFactory,
    })

    await expect(
      display.callMethod({ functionName: "lookup" })
    ).resolves.toEqual({ err: undefined, value: "42" })
  })

  it("types those records as themselves", () => {
    expectTypeOf<
      ReactorReturnOk<Service, "health">
    >().toEqualTypeOf<HealthView>()
    expectTypeOf<
      ReactorReturnOk<Service, "lookup">
    >().toEqualTypeOf<LookupView>()
  })

  it("still unwraps a Result variant", async () => {
    // Guard: the contract for real Results, both spellings.
    await expect(
      reactor.callMethod({ functionName: "transfer" })
    ).resolves.toBe(5n)
    const error = await reactor
      .callMethod({ functionName: "motoko" })
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(CanisterError)
    expect((error as CanisterError).err).toBe("boom")

    expectTypeOf<ReactorReturnOk<Service, "transfer">>().toEqualTypeOf<bigint>()
    expectTypeOf<ReactorReturnOk<Service, "motoko">>().toEqualTypeOf<bigint>()
  })

  it("still unwraps a display-transformed Result arm", () => {
    // Guard: DisplayReactor hands extractOkResult `{ _type, [tag]: payload }`.
    expect(extractOkResult({ _type: "Ok", Ok: "5" })).toBe("5")
    expect(() => extractOkResult({ _type: "Err", Err: "no" })).toThrow(
      CanisterError
    )
  })
})
