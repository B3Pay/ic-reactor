import {
  CallError,
  CanisterError,
  Reactor,
  isRetryableReactorError,
} from "@ic-reactor/core"
import { Principal } from "@icp-sdk/core/principal"
import { beforeAll, describe, expect, it } from "vitest"
import { idlFactory, type _SERVICE } from "../declarations/hello_actor"
import {
  BOOM_MESSAGE,
  PROFILE_AVATAR,
  PROFILE_BALANCE,
  PROFILE_DELTA,
  PROFILE_NONCE,
  createClientManager,
} from "./replica"

describe("Reactor against the local replica", () => {
  const clientManager = createClientManager()
  const reactor = new Reactor<_SERVICE>({
    clientManager,
    idlFactory,
    name: "hello_actor",
  })

  beforeAll(async () => {
    await clientManager.initialize()
  })

  it("unwraps the Ok arm of a Result", async () => {
    await expect(
      reactor.callMethod({ functionName: "divide", args: [6n, 3n] })
    ).resolves.toBe(2n)
  })

  it("throws a CanisterError that carries the Err arm", async () => {
    const call = reactor.callMethod({ functionName: "divide", args: [1n, 0n] })

    await expect(call).rejects.toThrow(CanisterError)
    await expect(call).rejects.toMatchObject({ err: "division by zero" })
  })

  it("decodes a record of big integers, a principal, a vector, an optional and a variant", async () => {
    const owner = Principal.fromText("aaaaa-aa")

    const profile = await reactor.callMethod({
      functionName: "profile",
      args: [owner],
    })

    expect(profile).toEqual({
      owner,
      balance: PROFILE_BALANCE,
      nonce: PROFILE_NONCE,
      delta: PROFILE_DELTA,
      tags: ["alpha", "beta"],
      avatar: [PROFILE_AVATAR],
      status: { Active: null },
    })
    expect(profile.owner).toBeInstanceOf(Principal)
    expect(profile.owner.toText()).toBe("aaaaa-aa")
  })

  it("decodes an empty optional and a variant arm with a payload", async () => {
    const profile = await reactor.callMethod({
      functionName: "profile",
      args: [Principal.anonymous()],
    })

    expect(profile.avatar).toEqual([])
    expect(profile.status).toEqual({ Frozen: "anonymous" })
  })

  it("reads back the counter that update calls incremented", async () => {
    // Other test files increment the same counter at the same time, so only
    // the order of the values is certain, not the values themselves.
    const first = await reactor.callMethod({ functionName: "increment" })
    const second = await reactor.callMethod({ functionName: "increment" })
    const count = await reactor.callMethod({ functionName: "count" })

    expect(first).toBeGreaterThanOrEqual(1n)
    expect(second).toBeGreaterThan(first)
    expect(count).toBeGreaterThanOrEqual(second)
  })

  it("rejects a call that traps with a CallError that is not retried", async () => {
    const call = reactor.callMethod({ functionName: "boom" })

    await expect(call).rejects.toThrow(CallError)
    await expect(call).rejects.toThrow(BOOM_MESSAGE)
    // A trap is reject code 5, which the replica gives again for the same call.
    // Reading that code off the agent's error is what makes this false; an
    // error without a readable code would be retried.
    expect(isRetryableReactorError(await call.catch((error) => error))).toBe(
      false
    )
  })

  it("calls as the anonymous principal until an identity is set", async () => {
    const caller = await reactor.callMethod({ functionName: "whoami" })

    expect(caller.isAnonymous()).toBe(true)
  })
})
