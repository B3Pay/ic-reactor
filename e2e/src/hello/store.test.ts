import { createReActorStore } from "@ic-reactor/store"
import {
  canisterId,
  hello_actor,
  idlFactory,
} from "../declarations/hello_actor/index.js"

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
  const { actorStore, callMethod, initialize } = createReActorStore<
    typeof hello_actor
  >({ canisterId, idlFactory })

  expect(actorStore.getState()).toEqual(DEFAULT_STATE)

  initialize()

  const greet = await callMethod("greet", "World")
  expect(greet).toEqual("Hello, World!")

  const greetUpdate = await callMethod("greet_update", "World")
  expect(greetUpdate).toEqual("Hello, World!")

  expect(actorStore.getState()).toEqual(DEFAULT_STATE)
})
