import { createReActor } from "../src"

const mockActor = () => {}

describe("createReActor", () => {
  test("uninitialized", () => {
    const { store } = createReActor(mockActor, {
      initializeOnMount: false,
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
    const { initializeActor, queryCall, store } = createReActor(mockActor)

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
