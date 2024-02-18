import { Cbor } from "@dfinity/agent"
import { IDL } from "@dfinity/candid"
import fetchMock from "jest-fetch-mock"
import { ActorManager, AgentManager } from "../src"
import { idlFactory } from "./candid/hello"
import { _SERVICE } from "./candid/hello/hello.did"

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
  const callback = jest.fn()

  const agentManager = new AgentManager({
    host: "https://local-mock",
    verifyQuerySignatures: false,
    withDevtools: false,
  })

  const { subscribeAgent } = agentManager

  subscribeAgent(callback)

  const { callMethod, initialize, getState } = new ActorManager<_SERVICE>({
    agentManager,
    canisterId: "bd3sg-teaaa-aaaaa-qaaba-cai",
    idlFactory,
    initializeOnCreate: false,
  })

  it("should initialized the actor", () => {
    expect(callback).toHaveBeenCalledTimes(0)

    expect(getState().initialized).toEqual(false)

    initialize()

    expect(callback).toHaveBeenCalledTimes(1)
  })

  it("should queryCall the query method", async () => {
    const data = await callMethod("greet", "World")

    expect(data).toEqual(canisterDecodedReturnValue)
  })

  it("should have not authenticated the actor", () => {
    const { authClient, authenticated, authenticating } =
      agentManager.authStore.getState()
    expect(authenticating).toEqual(false)
    expect(authenticated).toEqual(false)
    expect(authClient).toBeNull()
  })

  it("should authenticating the actor", async () => {
    const identity = agentManager.authenticate()

    const { authClient, authenticated, authenticating } =
      agentManager.authStore.getState()
    expect(authenticating).toEqual(true)
    expect(authenticated).toEqual(false)
    expect(authClient).toBeNull()
    await identity
  })

  it("should authenticated the actor", async () => {
    const { authClient, identity, authenticating } =
      agentManager.authStore.getState()

    expect(authenticating).toEqual(false)
    expect(authClient).toBeDefined()
    expect(identity).toBeDefined()

    expect(callback).toHaveBeenCalledTimes(2)
  })
})
