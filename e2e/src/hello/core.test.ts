import { createReActor } from "@ic-reactor/core"
import {
  canisterId,
  idlFactory,
  hello_actor,
} from "../declarations/hello_actor/index.js"

const DEFAULT_STATE = {
  initializing: false,
  initialized: false,
  error: undefined,
  methodState: {},
}

describe("Core Function Test", () => {
  const { initialize, actorStore, queryCall, updateCall } = createReActor<
    typeof hello_actor
  >({
    canisterId,
    idlFactory,
    initializeOnCreate: false,
  })

  expect(actorStore.getState()).toEqual(DEFAULT_STATE)

  // Initialize the actor
  it("should return the correct initial state", () => {
    initialize()

    const { initialized } = actorStore.getState()
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
})
