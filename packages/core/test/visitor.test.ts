import {
  VisitRandomArgs,
  VisitRandomRets,
  VisitTransform,
} from "../../visitor/src"
import { createReactorStore } from "../src"
import { example, idlFactory } from "./candid/example"

type Example = typeof example

describe("createReactorStore", () => {
  const { getState, visitFunction } = createReactorStore<Example>({
    canisterId: "2vxsx-fae",
    idlFactory,
    withVisitor: true,
  })

  test("Initialized", async () => {
    const value = visitFunction.get_app(new VisitRandomRets<Example>(), "app")
    const data = visitFunction.get_app(new VisitTransform(), {
      value,
      label: "app",
    })

    expect(data).toBeDefined()

    const args = visitFunction.get_app(new VisitRandomArgs<Example>(), "app")
    expect(args).toBeDefined()

    expect(getState()).toEqual({
      methodState: {},
      initialized: true,
      initializing: false,
      error: undefined,
    })
  })
})
