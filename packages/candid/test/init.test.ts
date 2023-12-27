import { Cbor } from "@dfinity/agent"
import { IDL } from "@dfinity/candid"
import fetchMock from "jest-fetch-mock"
import { ReActorManager } from "../src/reactor"
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

  const { initialize, callMethod, actorStore } = new ReActorManager<_SERVICE>({
    verifyQuerySignatures: false,
    initializeOnMount: false,
    canisterId: "bd3sg-teaaa-aaaaa-qaaba-cai",
    idlFactory,
    host: "https://local-mock",
  })

  const { subscribe, getState } = actorStore

  subscribe(callback)

  it("should initialize the actor", () => {
    expect(getState().initialized).toEqual(false)

    initialize()

    expect(getState().initialized).toEqual(true)
    expect(callback).toHaveBeenCalledTimes(2)
  })

  it("should queryCall the query method", async () => {
    const data = await callMethod("greet", "World")

    expect(data).toEqual(canisterDecodedReturnValue)
  })

  it("should subscribe to the actor state", () => {
    expect(callback).toHaveBeenCalledTimes(2)
  })
})
