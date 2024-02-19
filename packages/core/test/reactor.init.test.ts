import { createReActor } from "../src"
import { idlFactory } from "./candid/backend"

describe("createReActor", () => {
  test("uninitialized", () => {
    const { getState } = createReActor({
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
  })

  test("initialized", () => {
    const { getState } = createReActor({
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
  })
})
