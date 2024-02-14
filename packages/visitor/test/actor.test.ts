import { createReActorStore } from "@ic-reactor/store"
import {
  ExtractDetails,
  TransformNormal,
  RandomResponse,
  ExtractFields,
} from "../src"
import { b3system, idlFactory } from "./candid/b3system"

type B3System = typeof b3system

describe("createReActorStore", () => {
  const { actorStore, initialize, visitFunction } =
    createReActorStore<B3System>({
      canisterId: "2vxsx-fae",
      idlFactory,
      initializeOnCreate: false,
      withVisitor: true,
    })

  it("should return actor store", () => {
    expect(actorStore).toBeDefined()
  })

  test("Uninitialized", () => {
    const field = visitFunction.get_app(new ExtractFields<B3System>())
    console.log(field.defaultValues)
    const details = visitFunction.get_app(new ExtractDetails())
    console.log(details)

    const value = visitFunction.get_app(new RandomResponse())
    console.log(value)

    const transform = visitFunction.get_app(new TransformNormal(), {
      value,
      label: "test",
    })
    console.log(transform)

    const { methodState, initialized, initializing, error } =
      actorStore.getState()

    expect({ methodState, initialized, initializing, error }).toEqual({
      methodState: {},
      initialized: false,
      initializing: false,
      error: undefined,
    })
  })

  // test("Initialized", async () => {
  //   await initialize()

  //   const { methodState, initialized, initializing, error } =
  //     actorStore.getState()

  //   expect({ methodState, initialized, initializing, error }).toEqual({
  //     methodState: {},
  //     initialized: true,
  //     initializing: false,
  //     error: undefined,
  //   })
  // })
})
