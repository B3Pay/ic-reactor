import { ReActorManager } from "../src"
import AgentManager from "../src/agent"
import { idlFactory } from "./candid/b3_system"

describe("createReActorStore", () => {
  const agentManager = new AgentManager({
    host: "https://ic0.app",
    withDevtools: false,
  })

  test("Initialized", () => {
    const { actorStore } = new ReActorManager({
      canisterId: "2vxsx-fae",
      idlFactory,
      agentManager,
    })

    const {
      methodState,
      actor,
      methodFields,
      initialized,
      initializing,
      error,
    } = actorStore.getState()

    expect(actor).not.toBeNull()
    expect(methodFields).toBeDefined()

    expect({ methodState, initialized, initializing, error }).toEqual({
      methodState: {},
      initialized: true,
      initializing: false,
      error: undefined,
    })
  })
})
