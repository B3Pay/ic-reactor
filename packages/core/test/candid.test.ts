import { createReactorStore } from "../dist"
import { createCandidAdapter, createAgentManager } from "../src"

describe("createReactorStore", () => {
  const agentManager = createAgentManager()

  const candidAdapter = createCandidAdapter({ agentManager })

  it("should return candid idlFactory", async () => {
    const candid = await candidAdapter.getCandidDefinition(
      "a4gq6-oaaaa-aaaab-qaa4q-cai"
    )

    expect(candid.idlFactory).toBeDefined()
  })

  const canisterId = "ryjl3-tyaaa-aaaaa-aaaba-cai"

  it("should return fetch candid definition and callMethod", async () => {
    const { idlFactory } = await candidAdapter.getCandidDefinition(canisterId)

    const { callMethod } = createReactorStore({
      canisterId,
      idlFactory,
    })

    const name = await callMethod("name")

    expect(name).toEqual({ name: "Internet Computer" })
  })
})
