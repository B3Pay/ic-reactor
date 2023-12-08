import { createReActorStore } from "../src"

const mockActor = () => {}

describe("createReActorStore", () => {
  test("uninitialized", () => {
    const { store } = createReActorStore(mockActor, {
      host: "https://icp-api.io",
    })

    expect(store.getState()).toEqual({
      actorState: {},
      authClient: null,
      authenticated: false,
      authenticating: false,
      initialized: false,
      initializing: false,
      identity: null,
      loading: false,
      error: undefined,
    })
  })

  test("initialized", () => {
    const { initializeActor, store } = createReActorStore(mockActor)

    initializeActor()

    expect(store.getState()).toEqual({
      actorState: {},
      authClient: null,
      authenticated: false,
      authenticating: false,
      initialized: false,
      initializing: false,
      identity: null,
      loading: false,
      error: Error("Initialization failed: Actor could not be created."),
    })
  })
})
