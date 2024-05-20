import { createReactorStore } from "../src"
import { example, idlFactory } from "./candid/example"

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
      methodState: {},
      name: "2vxsx-fae",
      initialized: false,
      initializing: false,
      error: undefined,
    })
  })

  test("Initialized", async () => {
    await initialize()

    expect(getState()).toEqual({
      name: "2vxsx-fae",
      methodState: {},
      initialized: true,
      initializing: false,
      error: undefined,
    })
  })
})
