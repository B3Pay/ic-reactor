import { createReActor } from "../src"
import { idlFactory } from "./candid/backend"

describe("createReActor", () => {
  test("uninitialized", () => {
    const { actorStore } = createReActor({
      initializeOnCreate: false,
      canisterId: "xeka7-ryaaa-aaaal-qb57a-cai",
      idlFactory: idlFactory,
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
    const { initialize, actorStore } = createReActor({
      initializeOnCreate: false,
      canisterId: "xeka7-ryaaa-aaaal-qb57a-cai",
      idlFactory: idlFactory,
      host: "https://icp-api.io",
    })

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
