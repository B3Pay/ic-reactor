import { describe, test, expect } from "bun:test"
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
      isInitialized: false,
      isInitializing: false,
      error: undefined,
      methodState: {},
      name: "xeka7-ryaaa-aaaal-qb57a-cai",
      version: 0,
    })

    expect(actorStore.getState()).toEqual({
      initialized: false,
      isInitialized: false,
      initializing: false,
      isInitializing: false,
      error: undefined,
      methodState: {},
      name: "xeka7-ryaaa-aaaal-qb57a-cai",
      version: 0,
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
      isInitialized: true,
      initializing: false,
      isInitializing: false,
      methodState: {},
      error: undefined,
      name: "xeka7-ryaaa-aaaal-qb57a-cai",
      version: 0,
    })

    expect(actorStore.getState()).toEqual(getState())
  })
})
