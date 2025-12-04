import {
  mock,
  expect,
  describe,
  it,
  afterEach,
  beforeEach,
  spyOn,
} from "bun:test"
import { IDL } from "@icp-sdk/core/candid"
import { Cbor } from "@icp-sdk/core/agent"
import { idlFactory } from "./candid/hello"
import { createActorManager, createAgentManager } from "../src"
import { AgentManager, ActorManager } from "../src/types"

// --- Mocking Fetch Correctly ---
const canisterDecodedReturnValue = "Hello, World!"
const expectedReplyArg = IDL.encode([IDL.Text], [canisterDecodedReturnValue])

// Set up the spy before each test
beforeEach(() => {
  spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(
      async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString()

        if (url.endsWith("/call")) {
          return new Response(null, { status: 200 })
        }

        if (url.includes("/query")) {
          const responseObj = {
            status: "replied",
            reply: {
              arg: expectedReplyArg,
            },
          }
          return new Response(Cbor.encode(responseObj) as BodyInit)
        }

        // For other requests, return empty success response
        return new Response(JSON.stringify({}), { status: 200 })
      },
      { preconnect: () => {} } // Mock the preconnect property
    )
  )
})

// Restore the original fetch after each test
afterEach(() => {
  // This is crucial to prevent tests from interfering with each other
  mock.restore()
})

// --- Test Suite ---
describe("CreateActor", () => {
  // A helper function to set up a clean state for each test
  const setupTest = (): {
    agentManager: AgentManager
    actorManager: ActorManager
    callbacks: {
      agentCallback: typeof agentCallback
      authCallback: typeof authCallback
      actorCallback: typeof actorCallback
    }
  } => {
    const agentCallback = mock()
    const authCallback = mock()
    const actorCallback = mock()

    const agentManager = createAgentManager({
      verifyQuerySignatures: false,
    })

    agentManager.subscribeAgent(agentCallback)
    agentManager.subscribeAuthState(authCallback)

    const actorManager = createActorManager({
      agentManager,
      canisterId: "bd3sg-teaaa-aaaaa-qaaba-cai",
      idlFactory,
      initializeOnCreate: false,
    })

    actorManager.subscribeActorState(actorCallback)

    return {
      agentManager,
      actorManager,
      callbacks: { agentCallback, authCallback, actorCallback },
    }
  }

  it("should return the actor agent manager", () => {
    const { actorManager, agentManager } = setupTest()
    expect(actorManager.agentManager).toEqual(agentManager)
  })

  it("should initialize the actor", async () => {
    const { agentManager, actorManager, callbacks } = setupTest()
    const { agentCallback, authCallback, actorCallback } = callbacks

    expect(agentCallback).toHaveBeenCalledTimes(1)
    expect(authCallback).toHaveBeenCalledTimes(0)
    expect(actorCallback).toHaveBeenCalledTimes(0)

    await actorManager.initialize()

    expect(agentManager.isAuthClientInitialized()).toBe(false)
    expect(agentCallback).toHaveBeenCalledTimes(2)
    expect(authCallback).toHaveBeenCalledTimes(0)
    expect(actorCallback).toHaveBeenCalledTimes(2)
  })

  it("should call the query method", async () => {
    const { actorManager } = setupTest()
    await actorManager.initialize() // Actor must be initialized first

    const data = await actorManager.callMethod("greet", "World")
    expect(data).toEqual(canisterDecodedReturnValue)
  })

  it("should have not authenticated the actor", () => {
    const { agentManager } = setupTest()
    const { isAuthenticated, isAuthenticating } = agentManager.getAuthState()
    expect(isAuthenticating).toEqual(false)
    expect(isAuthenticated).toEqual(false)
    expect(agentManager.isAuthClientInitialized()).toBe(false)
  })

  it("should handle the authentication process", async () => {
    const { agentManager, callbacks } = setupTest()
    const { authCallback } = callbacks

    let authState = agentManager.getAuthState()
    expect(authState.identity).toEqual(null)
    expect(authState.authenticating).toBe(false)
    expect(authState.authenticated).toBe(false)
    expect(agentManager.isAuthClientInitialized()).toBe(false)
    // Start authentication
    const identityPromise = agentManager.authenticate()

    // State becomes "authenticating"
    expect(authCallback).toHaveBeenCalledTimes(1)
    authState = agentManager.getAuthState()
    expect(authState.identity).toEqual(null)
    expect(authState.isAuthenticating).toBe(true)
    expect(authState.isAuthenticated).toBe(false)
    expect(agentManager.isAuthClientInitialized()).toBe(false)

    // Wait for the process to complete
    await identityPromise

    // State becomes "authenticated"
    expect(authCallback).toHaveBeenCalledTimes(2)
    authState = agentManager.getAuthState()
    expect(authState.authenticating).toBe(false)
    expect(authState.identity?.getPrincipal().toString()).toEqual("2vxsx-fae")
    expect(authState.authenticated).toBe(false) // since the login is not happend yet!
    expect(agentManager.isAuthClientInitialized()).toBe(true)
  })
})
