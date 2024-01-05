import { createReActorStore } from "../src"
import { HttpAgent } from "@dfinity/agent"
import { idlFactory, b3_system } from "./candid/b3_system"

describe("My IC Store and Actions", () => {
  const { agentStore } = createReActorStore<typeof b3_system>({
    idlFactory,
    canisterId: "xeka7-ryaaa-aaaal-qb57a-cai",
  })

  it("should return agent store", () => {
    expect(agentStore).toBeDefined()

    const { agent, canisterId } = agentStore.getState()

    expect(agent).toBeInstanceOf(HttpAgent)

    expect(agent).toHaveProperty("query")

    expect(canisterId).toBe("xeka7-ryaaa-aaaal-qb57a-cai")
  })
})
