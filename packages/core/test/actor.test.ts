import { describe, it, test, expect } from "bun:test"
import { createReactorStore } from "../src"
import { example, idlFactory } from "./candid/example"
import { ActorMethodStates } from "../src/types"

type Example = typeof example

describe("createReactorStore", () => {
  const { getState, initialize, getActor, methodAttributes, visitFunction } =
    createReactorStore<Example>({
      canisterId: "2vxsx-fae",
      idlFactory,
      initializeOnCreate: false,
    })

  it("should return actor store", () => {
    expect(methodAttributes).toBeDefined()
    expect(getState()).toBeDefined()
    expect(visitFunction).toBeDefined()
    expect(getActor()).toBeNull()
  })

  test("Uninitialized", () => {
    expect(getState()).toEqual({
      methodState: {} as ActorMethodStates<Example>,
      name: "2vxsx-fae",
      initialized: false,
      initializing: false,
      isInitialized: false,
      isInitializing: false,
      error: undefined,
      version: 0,
    })
  })

  test("Initialized", async () => {
    await initialize()

    expect(getState()).toEqual({
      name: "2vxsx-fae",
      methodState: {} as ActorMethodStates<Example>,
      initialized: true,
      initializing: false,
      isInitialized: true,
      isInitializing: false,
      error: undefined,
      version: 0,
    })
  })
})
