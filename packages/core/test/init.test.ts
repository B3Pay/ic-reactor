import { createReActor } from "../src"

const mockActor = () => {}

describe("createReActor", () => {
  test("uninitialized", () => {
    const { actorStore } = createReActor(mockActor, {
      initializeOnMount: false,
      host: "https://icp-api.io",
    })

    expect(actorStore.getState()).toEqual({
      actor: null,
      initialized: false,
      initializing: false,
      error: undefined,
      methodState: {},
    })
  })

  test("initialized", () => {
    const { initialize, actorStore } = createReActor(mockActor)

    initialize()

    expect(actorStore.getState()).toEqual({
      actor: null,
      initialized: false,
      initializing: false,
      methodState: {},
      error: Error("Failed to initialize actor"),
    })
  })
})
