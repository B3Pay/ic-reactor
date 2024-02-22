import { IC_HOST_NETWORK_URI } from "../src/tools"
import { createAgentManager } from "../src"

describe("My IC Network agent", () => {
  const agentManager = createAgentManager({
    host: IC_HOST_NETWORK_URI,
    withDevtools: false,
  })

  it("should return agent store", async () => {
    const { getAgent } = agentManager

    expect(getAgent().isLocal()).toEqual(false)
    expect((await getAgent().getPrincipal()).toText()).toEqual("2vxsx-fae")
  })
})

describe("My Local Network agent", () => {
  const agentManager = createAgentManager({
    withDevtools: false,
    isLocalEnv: true,
  })

  it("should return agent store", async () => {
    const { getAgent } = agentManager

    expect(getAgent().isLocal()).toEqual(true)
    expect(getAgent().rootKey).toBeDefined()
    expect((await getAgent().getPrincipal()).toText()).toEqual("2vxsx-fae")
  })
})
