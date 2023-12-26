import { createReActorStore } from "../src"
import { canisterId, idlFactory } from "./candid/b3_system"

describe("createReActorStore", () => {
  test("uninitialized", () => {
    const { actorStore } = createReActorStore({
      canisterId,
      idlFactory,
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
    const { actorStore, callMethod } = createReActorStore({
      canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
      idlFactory: () => <any>{},
      host: "https://icp-api.io",
      initializeOnMount: true,
    })

    expect(actorStore.getState()).toEqual({
      methodState: {},
      initialized: false,
      initializing: false,
      actor: null,
      error: Error("service._fields is not iterable"),
    })
  })
})
