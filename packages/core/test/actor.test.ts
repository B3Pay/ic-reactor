import { createReactorStore } from "../src"
import { example, idlFactory } from "./candid/example"

type Example = typeof example

describe("createReactorStore", () => {
  const { getState, initialize, getActor, extractMethods, visitFunction } =
    createReactorStore<Example>({
      canisterId: "2vxsx-fae",
      idlFactory,
      initializeOnCreate: false,
    })

  it("should return actor store", () => {
    expect(getState()).toBeDefined()
    expect(visitFunction).toBeDefined()
    expect(getActor()).toBeNull()
  })

  test("Uninitialized", () => {
    expect(getState()).toEqual({
      methodState: {},
      initialized: false,
      initializing: false,
      error: undefined,
    })
  })

  test("Initialized", async () => {
    await initialize()

    expect(extractMethods()).toBeDefined()
    expect(getState()).toEqual({
      methodState: {},
      initialized: true,
      initializing: false,
      error: undefined,
    })
  })
})
