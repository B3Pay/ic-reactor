import {
  createAgentManager,
  createCandidAdapter,
  createReactorStore,
} from "../src"
import * as parser from "../../parser/dist/nodejs"
import { importCandidDefinition } from "../src/utils"

describe("createReactorStore", () => {
  const agentManager = createAgentManager()

  const candidAdapter = createCandidAdapter({ agentManager })
  it("should return fetch candid definition and callMethod using parser", async () => {
    await candidAdapter.initializeParser(parser)

    const candid = candidAdapter.parseDidToJs(
      `service:{icrc1_name:()->(text) query;}`
    )
    const canisterId = "ryjl3-tyaaa-aaaaa-aaaba-cai"

    try {
      const candidDef = await importCandidDefinition(candid)

      const { callMethod } = createReactorStore({
        canisterId,
        idlFactory: candidDef.idlFactory,
        agentManager,
      })

      const name = await callMethod("icrc1_name")

      expect(name).toEqual("Internet Computer")
    } catch (error) {
      console.error("Error in test:", error)
      throw error // Re-throw the error to fail the test
    }
  })
})
