import {
  ExtractDetails,
  TransformNormal,
  RandomResponse,
  createReActorCandidStore,
  ExtractFields,
} from "../src"
import { idlFactory } from "./candid/b3system"

describe("createReActorStore", () => {
  const {
    actorStore,
    initialize,
    visitFunction: serviceFunction,
  } = createReActorCandidStore({
    canisterId: "2vxsx-fae",
    idlFactory,
    initializeOnCreate: false,
  })

  it("should return actor store", () => {
    expect(actorStore).toBeDefined()
  })

  test("Uninitialized", () => {
    const field = serviceFunction.get_app(new ExtractFields())
    console.log(field)
    const details = serviceFunction.get_app(new ExtractDetails())
    console.log(details)

    const value = serviceFunction.get_app(new RandomResponse())
    console.log(value)

    const transform = serviceFunction.get_app(new TransformNormal(), {
      value,
      label: "test",
    })
    console.log(transform)
    expect(serviceFunction).toBeDefined()

    const { methodState, initialized, initializing, error } =
      actorStore.getState()

    expect({ methodState, initialized, initializing, error }).toEqual({
      methodState: {},
      initialized: false,
      initializing: false,
      error: undefined,
    })
  })

  test("Initialized", async () => {
    await initialize()

    const { methodState, initialized, initializing, error } =
      actorStore.getState()

    expect({ methodState, initialized, initializing, error }).toEqual({
      methodState: {},
      initialized: true,
      initializing: false,
      error: undefined,
    })
  })
})
