import { AgentManager, ActorManager } from "../src"
import { idlFactory, b3_system } from "./candid/b3_system"

describe("My IC Store and Actions", () => {
  const agentManager = new AgentManager({
    host: "https://ic0.app",
    withDevtools: false,
  })

  const { methodFields } = new ActorManager<typeof b3_system>({
    agentManager,
    idlFactory,
    canisterId: "xeka7-ryaaa-aaaal-qb57a-cai",
  })

  it("should return the function fields", () => {
    expect({ methodFields }).toBeDefined()
  })
})
