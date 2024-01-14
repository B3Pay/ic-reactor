import { createReActorStore } from "../src"
import { idlFactory } from "./candid/b3_system"

describe("createReActorStore", () => {
  const { actorStore, agentManager, serviceFields } = createReActorStore({
    canisterId: "2vxsx-fae",
    idlFactory,
    initializeOnCreate: false,
  })

  it("should return actor store", () => {
    expect(actorStore).toBeDefined()
  })

  test("Uninitialized", () => {
    expect(serviceFields).toBeDefined()

    const { methodState, initialized, initializing, error } =
      actorStore.getState()

    expect({ methodState, initialized, initializing, error }).toEqual({
      methodState: {},
      initialized: false,
      initializing: false,
      error: undefined,
    })
  })

  test("Initialized", async () => {
    await agentManager.updateAgent()
    expect(serviceFields).toBeDefined()

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
