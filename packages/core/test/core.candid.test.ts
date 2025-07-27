import { describe, it, expect } from "bun:test"
import {
  createActorManager,
  createCandidAdapter,
  createAgentManager,
  createReactorStore,
} from "../src"
import * as parser from "@ic-reactor/parser/dist/nodejs"
import { importCandidDefinition } from "../src/utils"

describe("Candid Tests", () => {
  const agentManager = createAgentManager()

  const candidAdapter = createCandidAdapter({ agentManager })

  it("compile the candid string", async () => {
    const candid = await candidAdapter.dynamicEvalJs(
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

  it("compile the candid string", async () => {
    await candidAdapter.initializeParser(parser)
    const candidJsCode = candidAdapter.parseDidToJs(
      `service:{icrc1_name:()->(text) query;}`
    )

    // Debug what importCandidDefinition returns
    const candidDef = await importCandidDefinition(candidJsCode)

    if (typeof candidDef.idlFactory === "function") {
      console.log("✅ idlFactory is a function")
    } else {
      console.log("❌ idlFactory is not a function")
      throw new Error(
        `Expected idlFactory to be a function, got ${typeof candidDef.idlFactory}`
      )
    }

    const { callMethod } = createActorManager({
      canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
      idlFactory: candidDef.idlFactory,
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
