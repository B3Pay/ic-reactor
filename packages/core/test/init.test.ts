import { mock, expect, describe, it, afterEach } from "bun:test"
import { IDL } from "@dfinity/candid"
import { idlFactory } from "./candid/hello"
import { _SERVICE } from "./candid/hello/hello.did"
import { createActorManager, createAgentManager } from "../src"
import { Cbor } from "@dfinity/agent"

// --- Mock Setup ---
const canisterDecodedReturnValue = "Hello, World!"
const expectedReplyArg = IDL.encode([IDL.Text], [canisterDecodedReturnValue])

// Use `fetchMock.doMock` for a persistent handler
fetchMock.doMock(async (req) => {
  if (req.url.endsWith("/call")) {
    return new Response(null, { status: 200 })
  }

  const responseObj = {
    status: "replied",
    reply: {
      arg: expectedReplyArg,
    },
  }
  return new Response(Cbor.encode(responseObj))
})

// `resetMocks()` will correctly clear the mock set by `doMock`
afterEach(() => {
  fetchMock.resetMocks()
})

// --- Test Suite ---
describe("CreateActor", () => {
  // Replaced jest.fn() with mock() from bun:test
  const agentCallback = mock()
  const authCallback = mock()
  const actorCallback = mock()

  const agentManager = createAgentManager({
    verifyQuerySignatures: false,
    withDevtools: false,
  })

  const { subscribeAgent, subscribeAuthState } = agentManager

  subscribeAgent(agentCallback)
  subscribeAuthState(authCallback)

  const {
    callMethod,
    initialize,
    agentManager: actorAgentManager,
    getState,
    subscribeActorState,
  } = createActorManager({
    agentManager,
    canisterId: "bd3sg-teaaa-aaaaa-qaaba-cai",
    idlFactory,
    initializeOnCreate: false,
  })

  subscribeActorState(actorCallback)

  it("should return the actor agent manager", () => {
    // expect() is identical
    expect(actorAgentManager).toEqual(agentManager)
  })

  it("should initialized the actor", async () => {
    // All assertions are identical
    expect(agentCallback).toHaveBeenCalledTimes(1)
    expect(authCallback).toHaveBeenCalledTimes(0)
    expect(actorCallback).toHaveBeenCalledTimes(0)

    expect(getState().initialized).toEqual(false)

    const promise = initialize()

    expect(agentCallback).toHaveBeenCalledTimes(2)
    expect(authCallback).toHaveBeenCalledTimes(0)
    expect(actorCallback).toHaveBeenCalledTimes(2)

    await promise

    expect(agentCallback).toHaveBeenCalledTimes(2)
    expect(authCallback).toHaveBeenCalledTimes(0)
    expect(actorCallback).toHaveBeenCalledTimes(2)
  })

  it("should queryCall the query method", async () => {
    const data = await callMethod("greet", "World")
    expect(data).toEqual(canisterDecodedReturnValue)
  })

  // The rest of your tests will work without any changes to their logic
  // because the `expect` and mock assertion APIs are the same.

  it("should have not authenticated the actor", () => {
    const { authenticated, authenticating } = agentManager.getAuthState()
    const authClient = agentManager.getAuth()

    expect(authenticating).toEqual(false)
    expect(authenticated).toEqual(false)
    expect(authClient).toBeNull()
  })

  it("should authenticating the actor", async () => {
    const identity = agentManager.authenticate()

    expect(authCallback).toHaveBeenCalledTimes(1)

    const { authenticated, authenticating } = agentManager.getAuthState()
    const authClient = agentManager.getAuth()

    expect(authenticating).toEqual(true)
    expect(authenticated).toEqual(false)
    expect(authClient).toBeNull()
    await identity
    expect(authCallback).toHaveBeenCalledTimes(2)
  })

  it("should authenticated the actor", async () => {
    const { identity, authenticating } = agentManager.getAuthState()
    const authClient = agentManager.getAuth()

    expect(authenticating).toEqual(false)
    expect(authClient).toBeDefined()
    expect(identity).toBeDefined()

    expect(agentCallback).toHaveBeenCalledTimes(3)
    expect(authCallback).toHaveBeenCalledTimes(2)
  })
})
