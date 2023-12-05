import createICStoreAndActions from "../src"

const mockActor = () => {}

describe("createICStoreAndActions", () => {
  test("uninitialized", () => {
    const { store } = createICStoreAndActions(mockActor)

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
    const { initializeActor, store } = createICStoreAndActions(mockActor)

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
