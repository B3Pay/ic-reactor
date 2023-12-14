import { createReActorStore } from "../src"

const mockActor = () => {}

describe("createReActorStore", () => {
  test("uninitialized", () => {
    const { actorStore } = createReActorStore(mockActor, {
      host: "https://icp-api.io",
      initializeOnMount: false,
    })

    expect(actorStore.getState()).toEqual({
      methodState: {},
      actor: null,
      initialized: false,
      initializing: false,
      error: undefined,
    })
  })

  test("initialized", () => {
    const { initialize, actorStore } = createReActorStore(mockActor)

    initialize()

    expect(actorStore.getState()).toEqual({
      methodState: {},
      initialized: false,
      initializing: false,
      actor: null,
      error: Error("Failed to initialize actor"),
    })
  })
})
