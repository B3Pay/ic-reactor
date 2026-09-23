import { CallError, CanisterError, DisplayReactor } from "@ic-reactor/core"
import { beforeAll, describe, expect, it } from "vitest"
import { idlFactory, type _SERVICE } from "../declarations/hello_actor"
import {
  BOOM_MESSAGE,
  PROFILE_BALANCE,
  PROFILE_DELTA,
  PROFILE_NONCE,
  createClientManager,
} from "./replica"

describe("DisplayReactor against the local replica", () => {
  const clientManager = createClientManager()
  const reactor = new DisplayReactor<_SERVICE>({
    clientManager,
    idlFactory,
    name: "hello_actor",
  })

  beforeAll(async () => {
    await clientManager.initialize()
  })

  it("takes and returns a nat as decimal text", async () => {
    await expect(
      reactor.callMethod({ functionName: "divide", args: ["6", "3"] })
    ).resolves.toBe("2")
  })

  it("throws a CanisterError that carries the Err arm", async () => {
    const call = reactor.callMethod({
      functionName: "divide",
      args: ["1", "0"],
    })

    await expect(call).rejects.toThrow(CanisterError)
    await expect(call).rejects.toMatchObject({ err: "division by zero" })
  })

  it("displays a record's numbers and principal as text, its blob as hex and its variant by _type", async () => {
    const profile = await reactor.callMethod({
      functionName: "profile",
      args: ["aaaaa-aa"],
    })

    expect(profile).toEqual({
      owner: "aaaaa-aa",
      balance: PROFILE_BALANCE.toString(),
      nonce: PROFILE_NONCE.toString(),
      delta: PROFILE_DELTA.toString(),
      tags: ["alpha", "beta"],
      avatar: "deadbeef",
      status: { _type: "Active" },
    })
    // Display values are the JSON-safe layer: no BigInt, Principal or bytes
    // survive to break a JSON round trip.
    expect(JSON.parse(JSON.stringify(profile))).toEqual(profile)
  })

  it("displays an empty optional as undefined and a variant payload under its arm", async () => {
    const profile = await reactor.callMethod({
      functionName: "profile",
      args: ["2vxsx-fae"],
    })

    expect(profile.avatar).toBeUndefined()
    expect(profile.status).toEqual({ _type: "Frozen", Frozen: "anonymous" })
  })

  it("returns the counter as decimal text", async () => {
    // Other test files increment the same counter at the same time.
    const first = await reactor.callMethod({ functionName: "increment" })
    const second = await reactor.callMethod({ functionName: "increment" })
    const count = await reactor.callMethod({ functionName: "count" })

    expect(first).toMatch(/^\d+$/)
    expect(BigInt(second)).toBeGreaterThan(BigInt(first))
    expect(BigInt(count)).toBeGreaterThanOrEqual(BigInt(second))
  })

  it("displays the caller as principal text", async () => {
    await expect(reactor.callMethod({ functionName: "whoami" })).resolves.toBe(
      "2vxsx-fae"
    )
  })

  it("rejects a call that traps with a CallError", async () => {
    const call = reactor.callMethod({ functionName: "boom" })

    await expect(call).rejects.toThrow(CallError)
    await expect(call).rejects.toThrow(BOOM_MESSAGE)
  })
})
