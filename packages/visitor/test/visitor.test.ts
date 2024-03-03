import { createReactorStore } from "@ic-reactor/core"
import {
  VisitRandomResponse,
  VisitFields,
  VisitDetails,
  VisitRandomArgs,
  VisitTransform,
} from "../src"
import { b3system, idlFactory } from "./candid/b3system"

type B3System = typeof b3system

describe("createReactorStore", () => {
  const { actorStore, visitFunction } = createReactorStore<B3System>({
    canisterId: "2vxsx-fae",
    idlFactory,
    withVisitor: true,
  })

  it("should visitFunction", () => {
    const field = visitFunction.get_app(new VisitFields<B3System>())
    console.log(field.defaultValues)
    const args = visitFunction.get_app(new VisitRandomArgs<B3System>())
    console.log(args)
    const details = visitFunction.get_app(new VisitDetails<B3System>())
    console.log(details)

    const value = visitFunction.get_app(new VisitRandomResponse<B3System>())
    console.log(value)

    const transform = visitFunction.get_app(new VisitTransform(), {
      value,
      label: "test",
    })
    console.log(transform.values)

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
