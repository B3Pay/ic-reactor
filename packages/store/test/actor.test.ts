import { VisitRandomResponse, VisitTransform } from "../../visitor/src"
import { createReActorStore } from "../src"
import { b3system, idlFactory } from "./candid/b3system"

type B3System = typeof b3system

describe("createReActorStore", () => {
  const { actorStore, initialize, getActor, visitFunction } =
    createReActorStore<B3System>({
      canisterId: "2vxsx-fae",
      idlFactory,
      initializeOnCreate: false,
      withVisitor: true,
    })

  it("should return actor store", () => {
    expect(actorStore).toBeDefined()
    expect(visitFunction).toBeDefined()
    expect(getActor()).toBeNull()
  })

  test("Uninitialized", () => {
    const value = visitFunction.get_app(new VisitRandomResponse())
    const data = visitFunction.get_app(new VisitTransform(), {
      value,
      label: "app",
    })

    console.log(data.values?.[0].value)

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
