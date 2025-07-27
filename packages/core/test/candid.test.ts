import { describe, it, expect } from "bun:test"
import {
  createActorManager,
  createCandidAdapter,
  createAgentManager,
  createReactorStore,
} from "../src"
import * as parser from "../../parser/dist/nodejs"
import { importCandidDefinition } from "../src/utils"

describe("createReactorStore", () => {
  const agentManager = createAgentManager()

  const candidAdapter = createCandidAdapter({ agentManager })

  it("compile the candid string", async () => {
    const candid = await candidAdapter.evaluateCandidDefinition(
      `service:{icrc1_name:()->(text) query;}`
    )

    const { callMethod } = createActorManager({
      canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
      idlFactory: candid.idlFactory,
      agentManager,
    })

    const name = await callMethod("icrc1_name")

    expect(name).toEqual("Internet Computer")
  })

  const canisterId = "ryjl3-tyaaa-aaaaa-aaaba-cai"

  it("should return fetch candid definition and callMethod", async () => {
    const { idlFactory } = await candidAdapter.getCandidDefinition(canisterId)

    const { callMethod } = createReactorStore({
      canisterId,
      idlFactory,
      agentManager,
    })

    const name = await callMethod("name")

    expect(name).toEqual({ name: "Internet Computer" })
  })

  it("should return fetch candid definition and callMethod using parser", async () => {
    await candidAdapter.initializeParser(parser)
    const candid = candidAdapter.parseDidToJs(
      `service:{icrc1_name:()->(text) query;}`
    )

    const candidDef = await importCandidDefinition(candid)

    const { callMethod } = createReactorStore({
      canisterId,
      idlFactory: candidDef.idlFactory,
      agentManager,
    })

    const name = await callMethod("icrc1_name")

    expect(name).toEqual("Internet Computer")
  })
})
