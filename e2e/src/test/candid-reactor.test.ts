import { readFileSync } from "node:fs"
import { join } from "node:path"
import { CanisterError } from "@ic-reactor/core"
import {
  CandidAdapter,
  CandidDisplayReactor,
  CandidReactor,
} from "@ic-reactor/candid"
import { IDL } from "@icp-sdk/core/candid"
import { beforeAll, describe, expect, it } from "vitest"
import { idlFactory, type _SERVICE } from "../declarations/hello_actor"
import {
  PROFILE_BALANCE,
  PROFILE_DELTA,
  PROFILE_NONCE,
  createClientManager,
  helloActorCanisterId,
} from "./replica"

/** Each method as `name: signature`, to compare two interfaces by. */
const signatures = (service: IDL.ServiceClass) =>
  service._fields.map(([name, func]) => `${name}: ${func.display()}`).sort()

describe("Reactors that fetch the Candid from the canister", () => {
  const clientManager = createClientManager()
  const canisterId = helloActorCanisterId()

  beforeAll(async () => {
    await clientManager.initialize()
  })

  it("reads the candid:service metadata the build embedded", async () => {
    const adapter = new CandidAdapter({ clientManager })

    const candid = await adapter.fetchFromMetadata(canisterId)

    expect(candid).toBe(
      readFileSync(
        join(import.meta.dirname, "../actor/hello_actor.did"),
        "utf8"
      )
    )
    const { idlFactory: fetched } =
      await adapter.getCandidDefinition(canisterId)
    expect(signatures(fetched({ IDL }))).toEqual(
      signatures(idlFactory({ IDL }))
    )
  })

  it("CandidReactor calls a method it only knows from the fetched Candid", async () => {
    const reactor = new CandidReactor<_SERVICE>({
      clientManager,
      canisterId,
      name: "hello_actor",
    })
    expect(reactor.hasMethod("divide")).toBe(false)

    await reactor.initialize()

    expect(reactor.hasMethod("divide")).toBe(true)
    await expect(
      reactor.callMethod({ functionName: "divide", args: [6n, 3n] })
    ).resolves.toBe(2n)
    const call = reactor.callMethod({ functionName: "divide", args: [1n, 0n] })
    await expect(call).rejects.toThrow(CanisterError)
    await expect(call).rejects.toMatchObject({ err: "division by zero" })
  })

  it("CandidDisplayReactor displays what it calls through the fetched Candid", async () => {
    const reactor = new CandidDisplayReactor<_SERVICE>({
      clientManager,
      canisterId,
      name: "hello_actor",
    })

    await reactor.initialize()

    await expect(
      reactor.callMethod({ functionName: "divide", args: ["6", "3"] })
    ).resolves.toBe("2")
    const call = reactor.callMethod({
      functionName: "divide",
      args: ["1", "0"],
    })
    await expect(call).rejects.toThrow(CanisterError)
    await expect(call).rejects.toMatchObject({ err: "division by zero" })
    await expect(
      reactor.callMethod({ functionName: "profile", args: ["aaaaa-aa"] })
    ).resolves.toEqual({
      owner: "aaaaa-aa",
      balance: PROFILE_BALANCE.toString(),
      nonce: PROFILE_NONCE.toString(),
      delta: PROFILE_DELTA.toString(),
      tags: ["alpha", "beta"],
      avatar: "deadbeef",
      status: { _type: "Active" },
    })
  })
})
