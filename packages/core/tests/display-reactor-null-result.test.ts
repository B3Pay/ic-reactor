import { describe, it, expect, vi } from "vitest"
import { QueryClient } from "@tanstack/query-core"
import { IDL } from "@icp-sdk/core/candid"
import type { ActorMethod } from "@icp-sdk/core/agent"
import { ClientManager } from "../src/client.js"
import { DisplayReactor } from "../src/display-reactor.js"
import { Reactor } from "../src/reactor.js"
import { CanisterError } from "../src/errors/index.js"
import { extractOkResult } from "../src/utils/helper.js"

/**
 * The display codec renders a variant as `{ _type: key, [key]: payload }` and
 * drops the payload key for a `null` arm. A Result whose Ok or Err arm carries
 * no payload — Rust's `Result<(), E>` and `Result<T, ()>` — therefore reaches
 * the unwrapping step as `{ _type: "Ok" }` or `{ _type: "Err" }`, which the
 * raw-shape checks did not recognise: an empty Err came back as a success
 * value, and an empty Ok came back as `{ _type: "Ok" }` where the declared
 * display type is `null`. Both must unwrap exactly as the raw path does.
 */

interface TestActor {
  /** Result<(), text> */
  unitOk: ActorMethod<[], { Ok: null } | { Err: string }>
  /** Result<nat, ()> */
  unitErr: ActorMethod<[], { Ok: bigint } | { Err: null }>
  /** Motoko spelling of Result<(), ()> */
  motoko: ActorMethod<[], { ok: null } | { err: null }>
}

const UnitOk = IDL.Variant({ Ok: IDL.Null, Err: IDL.Text })
const UnitErr = IDL.Variant({ Ok: IDL.Nat, Err: IDL.Null })
const Motoko = IDL.Variant({ ok: IDL.Null, err: IDL.Null })

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({
    unitOk: IDL.Func([], [UnitOk], ["query"]),
    unitErr: IDL.Func([], [UnitErr], ["query"]),
    motoko: IDL.Func([], [Motoko], ["query"]),
  })

const CANISTER_ID = "ryjl3-tyaaa-aaaaa-aaaba-cai"

const params = () => ({
  clientManager: new ClientManager({ queryClient: new QueryClient() }),
  name: "test",
  canisterId: CANISTER_ID,
  idlFactory,
})
const makeDisplay = () => new DisplayReactor<TestActor>(params())
const makeRaw = () => new Reactor<TestActor>(params())

const replyWith = (reactor: object, type: IDL.Type, value: unknown) =>
  vi
    .spyOn(reactor as any, "executeQuery")
    .mockResolvedValue(IDL.encode([type], [value]))

describe("DisplayReactor unwraps Result arms that carry no payload", () => {
  it("throws CanisterError for an empty Err arm, as the raw path does", async () => {
    const display = makeDisplay()
    replyWith(display, UnitErr, { Err: null })

    await expect(
      display.callMethod({ functionName: "unitErr" })
    ).rejects.toBeInstanceOf(CanisterError)
  })

  it("carries the same err as the raw path for an empty Err arm", async () => {
    const display = makeDisplay()
    const raw = makeRaw()
    replyWith(display, UnitErr, { Err: null })
    replyWith(raw, UnitErr, { Err: null })

    const fromDisplay = await display
      .callMethod({ functionName: "unitErr" })
      .then(
        () => undefined,
        (e: CanisterError) => e
      )
    const fromRaw = await raw.callMethod({ functionName: "unitErr" }).then(
      () => undefined,
      (e: CanisterError) => e
    )

    expect(fromDisplay?.err).toBeNull()
    expect(fromDisplay?.err).toEqual(fromRaw?.err)
    expect(fromDisplay?.message).toBe(fromRaw?.message)
  })

  it("returns null for an empty Ok arm, as the raw path does", async () => {
    const display = makeDisplay()
    replyWith(display, UnitOk, { Ok: null })

    await expect(display.callMethod({ functionName: "unitOk" })).resolves.toBe(
      null
    )
  })

  it("handles the Motoko spelling of both arms", async () => {
    const ok = makeDisplay()
    replyWith(ok, Motoko, { ok: null })
    await expect(ok.callMethod({ functionName: "motoko" })).resolves.toBe(null)

    const err = makeDisplay()
    replyWith(err, Motoko, { err: null })
    await expect(
      err.callMethod({ functionName: "motoko" })
    ).rejects.toBeInstanceOf(CanisterError)
  })

  it("still unwraps arms that carry a payload, in display form", async () => {
    // Guards against over-reach: with a payload the key survives the
    // transform and the raw-shape checks handle it.
    const okWithPayload = makeDisplay()
    replyWith(okWithPayload, UnitErr, { Ok: 42n })
    await expect(
      okWithPayload.callMethod({ functionName: "unitErr" })
    ).resolves.toBe("42")

    const errWithPayload = makeDisplay()
    replyWith(errWithPayload, UnitOk, { Err: "boom" })
    const error = await errWithPayload
      .callMethod({ functionName: "unitOk" })
      .then(
        () => undefined,
        (e: CanisterError) => e
      )
    expect(error?.err).toBe("boom")
  })
})

describe("extractOkResult on the display variant shape", () => {
  it("treats a tag with no payload key as an empty arm", () => {
    expect(extractOkResult({ _type: "Ok" })).toBeNull()
    expect(extractOkResult({ _type: "ok" })).toBeNull()
    expect(() => extractOkResult({ _type: "Err" })).toThrow(CanisterError)
    expect(() => extractOkResult({ _type: "err" })).toThrow(CanisterError)
  })

  it("leaves other display variants alone", () => {
    // A plain variant that is not a Result is still returned as-is.
    const active = { _type: "Active" }
    expect(extractOkResult(active)).toBe(active)
  })
})
