import { createActorStoreAndActions } from "@ic-reactor/store"
import { canisterId, createActor } from "../declarations/hello_actor/index.js"

const DEFAULT_STATE = {
  loading: false,
  initializing: false,
  initialized: false,
  authClient: null,
  authenticated: false,
  authenticating: false,
  identity: null,
  error: null,
  actorState: {},
}

test("Main Function Test", async () => {
  const [myStore, myActions] = createActorStoreAndActions((agent) =>
    createActor(canisterId, { agent })
  )

  expect(myStore.getState()).toEqual(DEFAULT_STATE)

  //expect throw error if not initialized
  // const shouldUndefiend = await myActions.callActor("greet", "World")
  // expect(shouldUndefiend).toEqual(undefined)

  // Initialize the actor
  const cancelActivation = myActions.initialize()

  const greet = await myActions.callActor("greet", "World")
  expect(greet).toEqual("Hello, World!")

  const greetState = myStore.getState().actorState.greet

  expect(greetState.data).toEqual("Hello, World!")
  expect(greetState.loading).toEqual(false)
  expect(greetState.error).toEqual(null)

  const greetUpdate = await myActions.callActor("greet_update", "World")
  expect(greetUpdate).toEqual("Hello, World!")

  const greetUpdateState = myStore.getState().actorState.greet
  expect(greetUpdateState.data).toEqual("Hello, World!")
  expect(greetUpdateState.loading).toEqual(false)
  expect(greetUpdateState.error).toEqual(null)

  cancelActivation()
  expect(myStore.getState()).toEqual(DEFAULT_STATE)
})
