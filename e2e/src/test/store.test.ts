import { createReactorStore } from "@ic-reactor/core"
import {
  canisterId,
  hello_actor,
  idlFactory,
} from "../declarations/hello_actor/index.js"
import type {
  AuthState,
  ActorState,
  AgentState,
} from "@ic-reactor/core/dist/types.js"

const AUTH_DEFAULT_STATE: AuthState = {
  identity: null,
  authenticated: false,
  authenticating: false,
  error: undefined,
}
const AGENT_DEFAULT_STATE: AgentState = {
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
    createReactorStore<typeof hello_actor>({
      canisterId,
      idlFactory,
      withLocalEnv: true,
      initializeOnCreate: false,
      verifyQuerySignatures: false,
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

  expect(agentManager.getAuthState()).toEqual(AUTH_DEFAULT_STATE)
  expect(agentManager.getAgentState()).toEqual(AGENT_DEFAULT_STATE)
})
