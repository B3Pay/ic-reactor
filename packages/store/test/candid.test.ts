import { ReActorManager } from "../src"
import AgentManager from "../src/agent"
import { idlFactory, b3_system } from "./candid/b3_system"

describe("My IC Store and Actions", () => {
  const agentManager = new AgentManager({
    host: "https://ic0.app",
    withDevtools: false,
  })

  const { actorStore } = new ReActorManager<typeof b3_system>({
    agentManager,
    idlFactory,
    canisterId: "xeka7-ryaaa-aaaal-qb57a-cai",
  })

  it("should return the function fields", () => {
    const { methodFields } = actorStore.getState()
    expect({ methodFields }).toBeDefined()
  })
})
