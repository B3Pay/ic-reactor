import { createReActorStore } from "../index"
import { canisterId, idlFactory } from "./candid/b3_system"

describe("createReActorStore", () => {
  test("uninitialized", () => {
    const { getActor } = createReActorStore({
      canisterId,
      idlFactory,
      host: "https://icp-api.io",
      initializeOnMount: false,
    })

    expect(getActor()).toEqual({
      methodState: {},
      methodFields: [],
      actor: null,
      initialized: false,
      initializing: false,
      error: undefined,
    })
  })

  test("initialized", () => {
    const { getActor } = createReActorStore({
      canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
      idlFactory: () => <any>{},
      host: "https://icp-api.io",
      initializeOnMount: true,
    })

    const callMethod = getActor().callMethod

    expect(getActor()).toEqual({
      methodState: {},
      methodFields: [],
      initialized: false,
      initializing: false,
      actor: null,
      error: Error("service._fields is not iterable"),
    })
  })
})
