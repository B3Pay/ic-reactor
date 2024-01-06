import { AgentManager, ActorManager } from "../src"
import { idlFactory } from "./candid/b3_system"

describe("createReActorStore", () => {
  const agentManager = new AgentManager({
    host: "https://ic0.app",
    withDevtools: false,
  })

  test("Initialized", () => {
    const { actorStore, methodFields } = new ActorManager({
      canisterId: "2vxsx-fae",
      idlFactory,
      agentManager,
    })

    expect(methodFields).toBeDefined()

    const { methodState, initialized, initializing, error } =
      actorStore.getState()

    expect({ methodState, initialized, initializing, error }).toEqual({
      methodState: {},
      initialized: true,
      initializing: false,
      error: undefined,
    })
  })
})
