import createActorStoreAndActions from "@ic-reactor/core"
import { canisterId, createActor } from "../declarations/hello_actor/index.js"

const DEFAULT_STATE = {
  loading: false,
  initializing: false,
  initialized: false,
  authClient: null,
  authenticated: false,
  authenticating: false,
  identity: null,
  error: undefined,
  actorState: {},
}

describe("Core Function Test", () => {
  const { store, actions, queryCall, updateCall, initializeActor } =
    createActorStoreAndActions((agent) => createActor(canisterId, { agent }), {
      initializeOnMount: false,
    })

  expect(store.getState()).toEqual(DEFAULT_STATE)

  // Initialize the actor
  it("should return the correct initial state", () => {
    initializeActor()

    const { initialized } = store.getState()
    expect(initialized).toEqual(true)
  })

  it("should call the greet function", async () => {
    const { initialData, requestHash, getState } = queryCall({
      functionName: "greet",
      args: ["World"],
    })

    expect(requestHash).toEqual(
      "c102685369c5e29182d7457bd5af52486928280f000dfe641db598b82c5753e0"
    )

    const { loading, data, error } = getState()

    expect(loading).toEqual(true)
    expect(data).toEqual(undefined)
    expect(error).toEqual(undefined)
    const greet = await initialData

    expect(greet).toEqual("Hello, World!")
  })

  it("should call the greet_update function", async () => {
    const { getState, requestHash, call } = updateCall({
      functionName: "greet_update",
      args: ["World"],
    })

    expect(requestHash).toEqual(
      "c102685369c5e29182d7457bd5af52486928280f000dfe641db598b82c5753e0"
    )

    const loadingBefore = getState("loading")
    expect(loadingBefore).toEqual(false)

    const result = call()

    const loadingAfter = getState("loading")
    expect(loadingAfter).toEqual(true)

    await result
    const { loading, data, error } = getState()

    expect(loading).toEqual(false)
    expect(data).toEqual("Hello, World!")
    expect(error).toEqual(undefined)
  })

  it("should reset the state", () => {
    actions.resetState()

    expect(store.getState()).toEqual(DEFAULT_STATE)
  })
})
