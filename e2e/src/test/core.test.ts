import { createReactorCore } from "@ic-reactor/core"
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
  const { initialize, getState, queryCall, updateCall } = createReactorCore<
    typeof hello_actor
  >({
    canisterId,
    idlFactory,
    withLocalEnv: true,
    initializeOnCreate: false,
  })

  expect(getState()).toEqual(DEFAULT_STATE)

  // Initialize the actor
  it("should return the correct initial state", () => {
    initialize()

    const { initialized } = getState()
    expect(initialized).toEqual(true)
  })

  it("should call the greet function", async () => {
    const { dataPromise, requestHash, getState } = queryCall({
      functionName: "greet",
      args: ["World"],
    })

    expect(requestHash).toEqual(
      "0xc102685369c5e29182d7457bd5af52486928280f000dfe641db598b82c5753e0"
    )

    const { loading, data, error } = getState()

    expect(loading).toEqual(true)
    expect(data).toEqual(undefined)
    expect(error).toEqual(undefined)
    const greet = await dataPromise

    expect(greet).toEqual("Hello, World!")
  })

  it("should call the greet_update function", async () => {
    const { getState, requestHash, call } = updateCall({
      functionName: "greet_update",
      args: ["World"],
    })

    expect(requestHash).toEqual(
      "0xc102685369c5e29182d7457bd5af52486928280f000dfe641db598b82c5753e0"
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

  it("should call the greet_update function", async () => {
    const { getState, requestHash, call } = updateCall({
      functionName: "greet_update",
      args: ["World"],
    })

    expect(requestHash).toEqual(
      "0xc102685369c5e29182d7457bd5af52486928280f000dfe641db598b82c5753e0"
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
