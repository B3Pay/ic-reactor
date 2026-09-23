import { MetadataDisplayReactor, MetadataReactor } from "@ic-reactor/candid"
import { beforeAll, describe, expect, it } from "vitest"
import type { _SERVICE } from "../declarations/hello_actor"
import {
  PROFILE_BALANCE,
  PROFILE_DELTA,
  PROFILE_NONCE,
  createClientManager,
  helloActorCanisterId,
} from "./replica"

describe("Metadata reactors built from the canister's Candid", () => {
  const clientManager = createClientManager()
  const canisterId = helloActorCanisterId()
  const reactor = new MetadataDisplayReactor<_SERVICE>({
    clientManager,
    canisterId,
    name: "hello_actor",
  })

  beforeAll(async () => {
    await clientManager.initialize()
    await reactor.initialize()
  })

  it("MetadataDisplayReactor describes a method's arguments for a form", () => {
    const meta = reactor.getInputMeta("divide")

    expect(meta).toMatchObject({
      functionName: "divide",
      functionType: "query",
      argCount: 2,
      defaults: ["", ""],
    })
    expect(
      meta?.args.map(({ name, candidType }) => ({ name, candidType }))
    ).toEqual([
      { name: "[0]", candidType: "nat" },
      { name: "[1]", candidType: "nat" },
    ])
    expect(meta?.schema.safeParse(["6", "3"]).success).toBe(true)
    expect(meta?.schema.safeParse(["-6", "3"]).success).toBe(false)
  })

  it("MetadataDisplayReactor resolves both arms of a Result for display", async () => {
    const ok = await reactor.callMethod({
      functionName: "divide",
      args: ["6", "3"],
    })
    expect(ok).toMatchObject({
      functionName: "divide",
      functionType: "query",
      raw: { Ok: 2n },
    })
    expect(ok.results).toHaveLength(1)
    expect(ok.results[0]).toMatchObject({
      displayType: "result",
      selected: "Ok",
      selectedValue: { candidType: "nat", value: "2" },
    })

    // The Err arm is a value to render here, not an error to throw.
    const err = await reactor.callMethod({
      functionName: "divide",
      args: ["1", "0"],
    })
    expect(err.results[0]).toMatchObject({
      displayType: "result",
      selected: "Err",
      selectedValue: { candidType: "text", value: "division by zero" },
    })
  })

  it("MetadataDisplayReactor resolves every field of a record", async () => {
    const result = await reactor.callMethod({
      functionName: "profile",
      args: ["aaaaa-aa"],
    })

    expect(result.results[0]).toMatchObject({
      type: "record",
      fields: {
        owner: { value: "aaaaa-aa" },
        balance: { value: PROFILE_BALANCE.toString() },
        nonce: { value: PROFILE_NONCE.toString() },
        delta: { value: PROFILE_DELTA.toString() },
        tags: { items: [{ value: "alpha" }, { value: "beta" }] },
        avatar: { value: { type: "blob", value: "deadbeef", length: 4 } },
        status: { selected: "Active" },
      },
    })
  })

  it("MetadataReactor resolves a call made with Candid values", async () => {
    const metadataReactor = new MetadataReactor<_SERVICE>({
      clientManager,
      canisterId,
      name: "hello_actor",
    })

    await metadataReactor.initialize()

    expect(metadataReactor.getInputMeta("divide")).toMatchObject({
      functionName: "divide",
      argCount: 2,
    })
    const result = await metadataReactor.callMethod({
      functionName: "divide",
      args: [6n, 3n],
    })
    expect(result.results[0]).toMatchObject({
      selected: "Ok",
      selectedValue: { value: "2" },
    })
  })
})
