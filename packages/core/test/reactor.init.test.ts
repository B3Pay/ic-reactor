import { createReactorCore } from "../src"
import { idlFactory } from "./candid/backend"

describe("createReactorCore", () => {
  test("uninitialized", () => {
    const { getState, actorStore } = createReactorCore({
      initializeOnCreate: false,
      canisterId: "xeka7-ryaaa-aaaal-qb57a-cai",
      idlFactory,
      host: "https://icp-api.io",
    })

    expect(getState()).toEqual({
      initialized: false,
      initializing: false,
      error: undefined,
      methodState: {},
    })

    expect(actorStore.getState()).toEqual({
      initialized: false,
      initializing: false,
      error: undefined,
      methodState: {},
    })
  })

  test("initialized", () => {
    const { getState, actorStore } = createReactorCore({
      canisterId: "xeka7-ryaaa-aaaal-qb57a-cai",
      idlFactory,
      host: "https://icp-api.io",
    })

    expect(getState()).toEqual({
      initialized: true,
      initializing: false,
      methodState: {},
      error: undefined,
    })

    expect(actorStore.getState()).toEqual(getState())
  })
})
