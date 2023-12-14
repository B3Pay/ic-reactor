import { Cbor } from "@dfinity/agent"
import { IDL } from "@dfinity/candid"
import fetchMock from "jest-fetch-mock"
import { ReActorManager } from "../src/reactor"
import { createActor } from "./candid/hello"

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

  const { initialize, callMethod, actorStore } = new ReActorManager(
    (agent) => {
      return createActor("bd3sg-teaaa-aaaaa-qaaba-cai", {
        agent,
      })
    },
    {
      verifyQuerySignatures: false,
      host: "https://local-mock",
    }
  )

  const { subscribe, getState } = actorStore

  subscribe(callback)

  it("should initialize the actor", () => {
    expect(getState().initialized).toEqual(false)
    initialize()

    expect(getState().initialized).toEqual(true)
    expect(callback).toHaveBeenCalledTimes(4)
  })

  it("should queryCall the query method", async () => {
    const data = await callMethod("greet", "World")

    expect(data).toEqual(canisterDecodedReturnValue)
  })

  it("should subscribe to the actor state", () => {
    expect(callback).toHaveBeenCalledTimes(4)
  })
})
