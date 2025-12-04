import { createReactorCore } from "@ic-reactor/core"
import {
  canisterId,
  idlFactory,
  hello_actor,
} from "../declarations/hello_actor/index.js"
import { describe, expect, it } from "bun:test"
import { ActorMethodStates, ActorState } from "@ic-reactor/core/src/types.js"

const DEFAULT_STATE: ActorState<typeof hello_actor> = {
  initializing: false,
  isInitializing: false,
  initialized: false,
  isInitialized: false,
  error: undefined,
  methodState: {} as ActorMethodStates<typeof hello_actor>,
  version: 0,
  name: canisterId,
}

describe("Core Function Test", () => {
  const { initialize, getState, queryCall, updateCall } = createReactorCore<
    typeof hello_actor
  >({
    canisterId,
    idlFactory,
    withProcessEnv: true,
    initializeOnCreate: false,
    verifyQuerySignatures: false,
  })

  console.log("Canister ID:", canisterId)
  console.log("Network:", process.env.DFX_NETWORK)
  console.log("Host:", process.env.IC_HOST)

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

    expect(requestHash).toEqual("0x3e5c8666")

    const { loading, data, error } = getState()

    expect(loading).toEqual(true)
    expect(data).toBeUndefined()
    expect(error).toBeUndefined()
    const greet = await dataPromise

    expect(greet).toEqual("Hello, World!")
  })

  it("should call the greet_update function", async () => {
    const { getState, requestHash, call } = updateCall({
      functionName: "greet_update",
      args: ["World"],
    })

    expect(requestHash).toEqual("0x3e5c8666")

    const loadingBefore = getState("loading")
    expect(loadingBefore).toEqual(false)

    const result = call()

    const loadingAfter = getState("loading")
    expect(loadingAfter).toEqual(true)

    await result
    const { loading, data, error } = getState()

    expect(loading).toEqual(false)
    expect(data).toEqual("Hello, World!")
    expect(error).toBeUndefined()
  })

  it("should call the greet_update function", async () => {
    const { getState, requestHash, call } = updateCall({
      functionName: "greet_update",
      args: ["World"],
    })

    expect(requestHash).toEqual("0x3e5c8666")

    const loadingBefore = getState("loading")
    expect(loadingBefore).toEqual(false)

    const result = call()

    const loadingAfter = getState("loading")
    expect(loadingAfter).toEqual(true)

    await result
    const { loading, data, error } = getState()

    expect(loading).toEqual(false)
    expect(data).toEqual("Hello, World!")
    expect(error).toBeUndefined()
  })
})
