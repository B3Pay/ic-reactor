import { get } from "svelte/store"
import { createReActorStore } from "../src"

const mockActor = () => {}

describe("createReActorStore", () => {
  test("uninitialized", () => {
    const { store } = createReActorStore(mockActor)

    expect(get(store)).toEqual({
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

    expect(get(store)).toEqual({
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
