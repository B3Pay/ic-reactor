import { Cbor } from "@dfinity/agent"
import { IDL } from "@dfinity/candid"
import fetchMock from "jest-fetch-mock"
import { ReActorManager } from "../src/reactor"
import { idlFactory } from "./candid/hello"
import { _SERVICE } from "./candid/hello/hello.did"
import AgentManager from "../src/agent"

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

  const { callMethod, actorStore } = new ReActorManager<_SERVICE>({
    agentManager,
    canisterId: "bd3sg-teaaa-aaaaa-qaaba-cai",
    idlFactory,
  })

  const { subscribe } = agentManager

  subscribe(callback)

  it("should initialized the actor", () => {
    expect(actorStore.getState().initialized).toEqual(true)

    expect(callback).toHaveBeenCalledTimes(0)
  })

  it("should queryCall the query method", async () => {
    const data = await callMethod("greet", "World")

    expect(data).toEqual(canisterDecodedReturnValue)
  })

  it("should subscribe to the actor state", () => {
    expect(callback).toHaveBeenCalledTimes(0)
  })

  it("should authenticate the actor", async () => {
    await agentManager.authenticate()

    expect(callback).toHaveBeenCalledTimes(1)
  })
})
