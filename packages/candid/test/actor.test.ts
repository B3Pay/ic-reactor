import { ExtractDetails, createReActorCandidStore } from "../src"
import { idlFactory } from "./candid/b3system"

describe("createReActorStore", () => {
  const { actorStore, initialize, serviceFields } = createReActorCandidStore({
    canisterId: "2vxsx-fae",
    idlFactory,
    initializeOnCreate: false,
  })

  it("should return actor store", () => {
    expect(actorStore).toBeDefined()
  })

  test("Uninitialized", () => {
    const extractDetails = new ExtractDetails()
    console.log(serviceFields.methodFields.get_app())
    console.log(serviceFields.methodFields.get_app(extractDetails))
    expect(serviceFields).toBeDefined()

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
