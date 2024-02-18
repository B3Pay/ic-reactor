import {
  VisitRandomArgs,
  VisitRandomResponse,
  VisitTransform,
} from "../../visitor/src"
import { createReActorStore } from "../src"
import { example, idlFactory } from "./candid/example"

type Example = typeof example

describe("createReActorStore", () => {
  const { getState, initialize, getActor, visitFunction } =
    createReActorStore<Example>({
      canisterId: "2vxsx-fae",
      idlFactory,
      initializeOnCreate: false,
      withVisitor: true,
    })

  it("should return actor store", () => {
    expect(getState()).toBeDefined()
    expect(visitFunction).toBeDefined()
    expect(getActor()).toBeNull()
  })

  test("Uninitialized", () => {
    const value = visitFunction.get_app(new VisitRandomResponse<Example>())
    const data = visitFunction.get_app(new VisitTransform<Example>(), {
      value,
      label: "app",
    })

    console.log(data.values?.[0].value)

    const args = visitFunction.get_app(new VisitRandomArgs<Example>())
    console.log(args)

    const { methodState, initialized, initializing, error } = getState()

    expect({ methodState, initialized, initializing, error }).toEqual({
      methodState: {},
      initialized: false,
      initializing: false,
      error: undefined,
    })
  })

  test("Initialized", async () => {
    await initialize()

    expect(getState()).toEqual({
      methodState: {},
      initialized: true,
      initializing: false,
      error: undefined,
    })
  })
})
