import { createReactorStore } from "@ic-reactor/core"
import {
  VisitRandomResponse,
  VisitFields,
  VisitDetails,
  VisitRandomArgs,
  VisitTransform,
  VisitLayouts,
} from "../src"
import { b3system, idlFactory } from "./candid/b3system"
import { ServiceDetails } from "../src/types"
import { jsonToString } from "@ic-reactor/core/dist/utils"

type B3System = typeof b3system

describe("createReactorStore", () => {
  const { actorStore, extractInterface, visitFunction } =
    createReactorStore<B3System>({
      canisterId: "2vxsx-fae",
      idlFactory,
      withVisitor: true,
    })

  const visitedService = () => {
    const iface = extractInterface()
    const fieldsVisitor = new VisitLayouts()
    return fieldsVisitor.visitService(iface)
  }

  it("should visitFunction", () => {
    // const field = visitFunction.get_app(new VisitFields<B3System>())
    // console.log(field.defaultValues)
    // const args = visitFunction.get_app(new VisitRandomArgs<B3System>())
    // console.log(args)
    const details = visitedService()
    console.log(jsonToString(details))

    // const value = visitFunction.get_app(new VisitRandomResponse<B3System>())
    // console.log(value)

    // const transform = visitFunction.get_app(new VisitTransform(), {
    //   value,
    //   label: "test",
    // })
    // console.log(transform.values)

    // const { methodState, initialized, initializing, error } =
    //   actorStore.getState()

    // expect({ methodState, initialized, initializing, error }).toEqual({
    //   methodState: {},
    //   initialized: true,
    //   initializing: false,
    //   error: undefined,
    // })
  })
})
