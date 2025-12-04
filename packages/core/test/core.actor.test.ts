import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
  spyOn,
  mock,
} from "bun:test"
import { Cbor } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { createReactorCore } from "../src"
import { hello, idlFactory } from "./candid/hello"

const canisterDecodedReturnValue = "Hello, World!"
const expectedReplyArg = IDL.encode([IDL.Text], [canisterDecodedReturnValue])

// Set up global fetch mock
beforeAll(() => {
  spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(
      async (input: RequestInfo | URL) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
            ? input.toString()
            : input.url

        if (url.endsWith("/call")) {
          return new Response(null, {
            status: 200,
          })
        }

        const responseObj = {
          status: "replied",
          reply: {
            arg: expectedReplyArg,
          },
        }

        return new Response(Cbor.encode(responseObj), {
          status: 200,
        })
      },
      { preconnect: () => {} } // Add the required preconnect property
    )
  )
})

describe("Initialize and Subscriptions", () => {
  // Test specific to fireImmediately behavior
  describe("Subscription Immediate Firing", () => {
    const immediateCallback = mock()

    it("should fire immediately when option is set", () => {
      const { subscribeActorState } = createReactorCore<typeof hello>({
        idlFactory,
        canisterId: "aaaaa-aa",
        initializeOnCreate: false,
        verifyQuerySignatures: false,
        host: "https://local-mock",
      })

      const unsubscribe = subscribeActorState(
        (state) => state.initialized,
        immediateCallback,
        { fireImmediately: true }
      )

      // Update expectation to match actual behavior - prev value is false on first call
      expect(immediateCallback).toHaveBeenCalledTimes(1)
      expect(immediateCallback).toHaveBeenCalledWith(false, false)

      unsubscribe()
    })
  })

  let callCounter = 0
  const simpleCallback = mock((_: any) => {
    callCounter++
  })
  const methodStateCallback = mock()
  const loadingStateCallback = mock()
  const customEqualityFn = mock((a: any, b: any) => a === b)
  const counterCallback = mock()

  let unsubscribeSimple: () => void
  let unsubscribeMethodState: () => void
  let unsubscribeLoadingState: () => void
  let unsubscribeCounter: () => void

  const {
    initialize,
    subscribeActorState,
    getState,
    updateCall,
    queryCall,
    setState,
  } = createReactorCore<typeof hello>({
    idlFactory,
    canisterId: "aaaaa-aa",
    initializeOnCreate: false,
    verifyQuerySignatures: false,
    host: "https://local-mock",
  })

  beforeAll(async () => {
    // First set up subscriptions
    unsubscribeLoadingState = subscribeActorState(
      (state) => state.initialized,
      loadingStateCallback,
      { fireImmediately: true }
    )

    // Wait for initial subscription to fire
    await new Promise((resolve) => setTimeout(resolve, 0))

    // Set up remaining subscriptions
    unsubscribeCounter = subscribeActorState(
      (state) => (state as any).counter,
      counterCallback,
      { fireImmediately: true }
    )

    unsubscribeMethodState = subscribeActorState(
      (state) => state.methodState,
      methodStateCallback,
      { equalityFn: customEqualityFn }
    )

    unsubscribeSimple = subscribeActorState((state) => {
      simpleCallback(state)
      return state
    })

    // Set initial state after subscriptions
    setState((state) => ({
      ...state,
      counter: 0,
    }))

    // Wait for state updates to propagate
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

  beforeEach(() => {
    simpleCallback.mockClear()
    methodStateCallback.mockClear()
    loadingStateCallback.mockClear()
    customEqualityFn.mockClear()
    counterCallback.mockClear()
  })

  afterAll(() => {
    unsubscribeSimple()
    unsubscribeMethodState()
    unsubscribeLoadingState()
    unsubscribeCounter()
  })

  it("should handle initialization and update simple subscription", async () => {
    await initialize()

    expect(simpleCallback).toHaveBeenCalled()
    const lastCall =
      simpleCallback.mock.calls[simpleCallback.mock.calls.length - 1][0]
    expect(lastCall.initialized).toBe(true)
  })

  it("should handle selector subscription with equality function", async () => {
    const { call } = updateCall({
      functionName: "greet",
      args: ["World"],
    })

    await call()

    expect(methodStateCallback).toHaveBeenCalled()
    expect(methodStateCallback).toHaveBeenCalledTimes(3)

    expect(customEqualityFn).toHaveBeenCalled()
    expect(customEqualityFn).toHaveBeenCalledTimes(3)
  })

  it("should track state updates with counter", async () => {
    // Clear previous calls
    counterCallback.mockClear()

    const initialCounter = (getState() as any).counter

    // Update counter multiple times
    for (let i = 0; i < 3; i++) {
      setState((state) => ({
        ...state,
        counter: (state as any).counter + 1,
      }))
      // Wait for state update to propagate
      await new Promise((resolve) => setTimeout(resolve, 0))
    }

    expect(counterCallback.mock.calls.length).toBe(3)
    const lastCall =
      counterCallback.mock.calls[counterCallback.mock.calls.length - 1]
    expect(lastCall).toEqual([initialCounter + 3, initialCounter + 2])
  })

  it("should queryCall and notify all subscribers", async () => {
    const { dataPromise } = queryCall({
      functionName: "greet",
      args: ["World"],
    })

    await dataPromise

    expect(simpleCallback).toHaveBeenCalled()
    expect(methodStateCallback).toHaveBeenCalled()
  })

  it("should updateCall and track loading states", async () => {
    const { call } = updateCall({
      functionName: "greet",
      args: ["World"],
    })

    const promise = call()

    // Verify loading state
    const loadingState = methodStateCallback.mock.calls.find(
      (call: any) => call[0]?.greet?.["0x3e5c8666"]?.loading === true
    )
    expect(loadingState).toBeTruthy()

    await promise

    // Verify completed state
    const completedState = methodStateCallback.mock.calls.find(
      (call: any) =>
        call[0]?.greet?.["0x3e5c8666"]?.data === canisterDecodedReturnValue &&
        call[0]?.greet?.["0x3e5c8666"]?.loading === false
    )
    expect(completedState).toBeTruthy()
  })

  it("should handle error states and notify subscribers", async () => {
    // Mock a network error for this specific call
    spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network error"))

    const { call } = updateCall({
      functionName: "greet",
      args: ["World"],
    })

    try {
      await call()
    } catch (error) {
      const errorState = methodStateCallback.mock.calls.find(
        (call: any) =>
          call[0]?.greet?.["0x3e5c8666"]?.error instanceof Error &&
          call[0]?.greet?.["0x3e5c8666"]?.loading === false
      )
      expect(errorState).toBeTruthy()
    }
  })

  it("should unsubscribe and stop receiving updates", async () => {
    simpleCallback.mockClear()
    counterCallback.mockClear()

    unsubscribeSimple()
    unsubscribeMethodState()
    unsubscribeLoadingState()
    unsubscribeCounter()

    setState((state) => ({
      ...state,
      counter: (state as any).counter + 1,
    }))

    // Wait for potential updates
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(simpleCallback).not.toHaveBeenCalled()
    expect(counterCallback).not.toHaveBeenCalled()
  })
})
