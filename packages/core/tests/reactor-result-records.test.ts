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
import type {
  ErrResult,
  IsOkErrResultType,
  OkResult,
  UnwrapOkErrResult,
} from "../src/types/result.js"
import type { DisplayResultOf } from "../src/display/types.js"

const Health = IDL.Record({ ok: IDL.Bool, message: IDL.Text })
const Lookup = IDL.Record({ err: IDL.Opt(IDL.Text), value: IDL.Nat })
// `_type` is also the key of the discriminant the display codec writes next to
// a variant arm. As a record's own field it is a field like `message` above.
const TaggedHealth = IDL.Record({ _type: IDL.Text, ok: IDL.Bool })
const TaggedLookup = IDL.Record({ _type: IDL.Text, err: IDL.Opt(IDL.Text) })
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
interface TaggedHealthView {
  _type: string
  ok: boolean
}
interface TaggedLookupView {
  _type: string
  err: [] | [string]
}

interface Service {
  health: ActorMethod<[], HealthView>
  lookup: ActorMethod<[], LookupView>
  taggedHealth: ActorMethod<[], TaggedHealthView>
  taggedLookup: ActorMethod<[], TaggedLookupView>
  transfer: ActorMethod<[], { Ok: bigint } | { Err: string }>
  motoko: ActorMethod<[], { ok: bigint } | { err: string }>
}

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({
    health: IDL.Func([], [Health], ["query"]),
    lookup: IDL.Func([], [Lookup], ["query"]),
    taggedHealth: IDL.Func([], [TaggedHealth], ["query"]),
    taggedLookup: IDL.Func([], [TaggedLookup], ["query"]),
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
 * display-transformed variant carries — which names that key. A `_type` that
 * names anything else is the record's own field.
 */
describe("Result unwrapping and records with ok/err fields", () => {
  let reactor: Reactor<Service>
  const replies: Record<string, Uint8Array> = {
    health: IDL.encode([Health], [{ ok: true, message: "all good" }]),
    lookup: IDL.encode([Lookup], [{ err: [], value: 42n }]),
    taggedHealth: IDL.encode([TaggedHealth], [{ _type: "health", ok: true }]),
    taggedLookup: IDL.encode([TaggedLookup], [{ _type: "metadata", err: [] }]),
    transfer: IDL.encode([TransferResult], [{ Ok: 5n }]),
    motoko: IDL.encode([MotokoResult], [{ err: "boom" }]),
  }

  // DisplayReactor unwraps through the same helper, after its codec.
  const displayReactor = () =>
    new DisplayReactor<Service>({
      clientManager: reactor.clientManager,
      name: "service-display",
      canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
      idlFactory,
    })

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
    await expect(
      displayReactor().callMethod({ functionName: "lookup" })
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

  // `_type` was skipped whatever it held, leaving `ok` or `err` as the only key.
  it("returns a record with its own `_type` and an `ok` field whole", async () => {
    // Resolved to the bare `true`.
    await expect(
      reactor.callMethod({ functionName: "taggedHealth" })
    ).resolves.toEqual({ _type: "health", ok: true })
  })

  it("does not throw for a record with its own `_type` and an `err` field", async () => {
    // Threw `CanisterError: []` on this successful call.
    await expect(
      reactor.callMethod({ functionName: "taggedLookup" })
    ).resolves.toEqual({ _type: "metadata", err: [] })
  })

  it("returns a record with its own `_type` whole from a DisplayReactor too", async () => {
    // The display codec renders a record field by field, so `_type` stays the
    // record's text; only a variant gets a `_type` that names its arm.
    const display = displayReactor()

    await expect(
      display.callMethod({ functionName: "taggedHealth" })
    ).resolves.toEqual({ _type: "health", ok: true })
    await expect(
      display.callMethod({ functionName: "taggedLookup" })
    ).resolves.toEqual({ _type: "metadata", err: undefined })
  })

  it("types records with their own `_type` as themselves", () => {
    // `_type: string` is a field; only the literal of the arm key is the
    // display discriminant.
    expectTypeOf<
      ReactorReturnOk<Service, "taggedHealth">
    >().toEqualTypeOf<TaggedHealthView>()
    expectTypeOf<
      ReactorReturnOk<Service, "taggedLookup">
    >().toEqualTypeOf<TaggedLookupView>()
    expectTypeOf<
      ReactorReturnOk<Service, "taggedHealth", "display">
    >().toEqualTypeOf<{ _type: string; ok: boolean }>()
    // Neither is a Result, so neither has an Err payload.
    expectTypeOf<ErrResult<TaggedLookupView>>().toEqualTypeOf<never>()
    expectTypeOf<IsOkErrResultType<TaggedHealthView>>().toEqualTypeOf<false>()
    expectTypeOf<
      UnwrapOkErrResult<TaggedLookupView>
    >().toEqualTypeOf<TaggedLookupView>()
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

  it("still unwraps a Result variant from a DisplayReactor", async () => {
    // Guard: the codec turns these into `{ _type: "Ok", Ok: "5" }` and
    // `{ _type: "err", err: "boom" }`, whose `_type` names the arm.
    const display = displayReactor()

    await expect(
      display.callMethod({ functionName: "transfer" })
    ).resolves.toBe("5")
    const error = await display
      .callMethod({ functionName: "motoko" })
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(CanisterError)
    expect((error as CanisterError).err).toBe("boom")

    expectTypeOf<
      ReactorReturnOk<Service, "transfer", "display">
    >().toEqualTypeOf<string>()
  })

  it("still unwraps a display-transformed Result arm", () => {
    // Guard: DisplayReactor hands extractOkResult `{ _type, [tag]: payload }`.
    expect(extractOkResult({ _type: "Ok", Ok: "5" })).toBe("5")
    expect(extractOkResult({ _type: "ok", ok: "5" })).toBe("5")
    expect(() => extractOkResult({ _type: "Err", Err: "no" })).toThrow(
      CanisterError
    )
    expect(() => extractOkResult({ _type: "err", err: "no" })).toThrow(
      CanisterError
    )

    // The display type carries `_type` as the literal arm key.
    type DisplayTransfer = DisplayResultOf<{ Ok: bigint } | { Err: string }>
    expectTypeOf<OkResult<DisplayTransfer>>().toEqualTypeOf<string>()
    expectTypeOf<ErrResult<DisplayTransfer>>().toEqualTypeOf<string>()
  })
})
