import createActorStoreAndActions from "@ic-reactor/store"
import { canisterId, createActor } from "../declarations/hello_actor/index.js"

const DEFAULT_STATE = {
  loading: false,
  initializing: false,
  initialized: false,
  authClient: null,
  authenticated: false,
  authenticating: false,
  identity: null,
  error: undefined,
  actorState: {},
}

test("Main Function Test", async () => {
  const { store, actions, initializeActor } = createActorStoreAndActions(
    (agent) => createActor(canisterId, { agent })
  )

  expect(store.getState()).toEqual(DEFAULT_STATE)

  //expect throw error if not initialized
  // const shouldUndefiend = await actions.callMethod("greet", "World")
  // expect(shouldUndefiend).toEqual(undefined)

  // Initialize the actor
  initializeActor()

  const greet = await actions.callMethod("greet", "World")
  expect(greet).toEqual("Hello, World!")

  const greetUpdate = await actions.callMethod("greet_update", "World")
  expect(greetUpdate).toEqual("Hello, World!")

  actions.resetState()

  expect(store.getState()).toEqual(DEFAULT_STATE)
})
