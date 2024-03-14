import {
  createActorManager,
  createReactorStore,
  createCandidAdapter,
  createAgentManager,
} from "../src"

describe("createReactorStore", () => {
  const agentManager = createAgentManager()

  const candidAdapter = createCandidAdapter({ agentManager })

  it("compile the candid string", async () => {
    const candid = await candidAdapter.didTojs(
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

  // it("should return candid idlFactory", async () => {
  //   const candid = await candidAdapter.getCandidDefinition(
  //     "a4gq6-oaaaa-aaaab-qaa4q-cai"
  //   )

  //   expect(candid.idlFactory).toBeDefined()
  // })

  // const canisterId = "ryjl3-tyaaa-aaaaa-aaaba-cai"

  // it("should return fetch candid definition and callMethod", async () => {
  //   const { idlFactory } = await candidAdapter.getCandidDefinition(canisterId)

  //   const { callMethod } = createReactorStore({
  //     canisterId,
  //     idlFactory,
  //     agentManager,
  //   })

  //   const name = await callMethod("name")

  //   expect(name).toEqual({ name: "Internet Computer" })
  // })
})
