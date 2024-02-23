import { Cbor } from "@dfinity/agent"
import { IDL } from "@dfinity/candid"
import fetchMock from "jest-fetch-mock"
import { idlFactory } from "./candid/hello"
import { _SERVICE } from "./candid/hello/hello.did"
import { createActorManager, createAgentManager } from "../src"

fetchMock.enableMocks()

const canisterDecodedReturnValue = "Hello, World!"
const expectedReplyArg = IDL.encode([IDL.Text], [canisterDecodedReturnValue])

fetchMock.mockResponse(async (req) => {
  if (req.url.endsWith("/call")) {
    return Promise.resolve({
      status: 200,
    })
  }

  const responseObj = {
    status: "replied",
    reply: {
      arg: expectedReplyArg,
    },
  }

  return Promise.resolve({
    status: 200,
    body: Cbor.encode(responseObj),
  })
})

describe("CreateActor", () => {
  const agentCallback = jest.fn()
  const authCallback = jest.fn()
  const actorCallback = jest.fn()

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
    expect(actorAgentManager).toEqual(agentManager)
  })

  it("should initialized the actor", async () => {
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
