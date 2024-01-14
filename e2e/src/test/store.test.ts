import {
  ActorState,
  AgentAuthState,
  createReActorStore,
} from "@ic-reactor/store"
import {
  canisterId,
  hello_actor,
  idlFactory,
} from "../declarations/hello_actor/index.js"

const AUTH_DEFAULT_STATE: AgentAuthState = {
  identity: null,
  authenticated: false,
  authClient: null,
  authenticating: false,
  error: undefined,
  initialized: true,
  initializing: false,
}

const ACTOR_DEFAULT_STATE: ActorState<typeof hello_actor> = {
  initialized: false,
  initializing: false,
  error: undefined,
  methodState: {} as any,
}

test("Main Function Test", async () => {
  const { actorStore, agentManager, callMethod, initialize } =
    createReActorStore<typeof hello_actor>({
      canisterId,
      idlFactory,
      isLocalEnv: true,
      initializeOnCreate: false,
    })

  expect(actorStore.getState()).toEqual(ACTOR_DEFAULT_STATE)

  initialize()

  expect(actorStore.getState()).toEqual({
    initialized: true,
    initializing: false,
    error: undefined,
    methodState: {},
  })

  const greet = await callMethod("greet", "World")
  expect(greet).toEqual("Hello, World!")

  const greetUpdate = await callMethod("greet_update", "World")
  expect(greetUpdate).toEqual("Hello, World!")

  expect(agentManager.authStore.getState()).toEqual(AUTH_DEFAULT_STATE)
})
