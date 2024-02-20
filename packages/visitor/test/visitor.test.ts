import { createReactorStore } from "@ic-reactor/core"
import {
  VisitRandomResponse,
  VisitTransformTable,
  VisitFields,
  VisitDetails,
  VisitRandomArgs,
} from "../src"
import { b3system, idlFactory } from "./candid/b3system"

type B3System = typeof b3system

describe("createReactorStore", () => {
  const { actorStore, visitFunction } = createReactorStore<B3System>({
    canisterId: "2vxsx-fae",
    idlFactory,
    initializeOnCreate: false,
    withVisitor: true,
  })

  it("should return actor store", () => {
    expect(actorStore).toBeDefined()
  })

  test("Uninitialized", () => {
    const field = visitFunction.get_app(new VisitFields<B3System>())
    console.log(field.defaultValues)
    const args = visitFunction.get_app(new VisitRandomArgs<B3System>())
    console.log(args)
    const details = visitFunction.get_app(new VisitDetails<B3System>())
    console.log(details)

    const value = visitFunction.get_app(new VisitRandomResponse<B3System>())
    console.log(value)

    const transform = visitFunction.get_app(
      new VisitTransformTable<B3System>(),
      {
        value,
        label: "test",
      }
    )
    console.log(transform.values?.[0].value)

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
