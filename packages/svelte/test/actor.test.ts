import { Cbor } from "@dfinity/agent"
import { IDL } from "@dfinity/candid"
import fetchMock from "jest-fetch-mock"
import { get } from "svelte/store"
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

  const { actions, store } = new ReActorManager(
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

  const { initialize } = actions
  const { subscribe } = store

  subscribe(callback)

  it("should initialize the actor", () => {
    expect(get(store).initialized).toEqual(false)
    initialize()

    expect(get(store).initialized).toEqual(true)
    expect(callback).toHaveBeenCalledTimes(4)
  })

  it("should queryCall the query method", async () => {
    const data = await actions.callMethod("greet", "World")

    expect(data).toEqual(canisterDecodedReturnValue)
  })

  it("should subscribe to the actor state", () => {
    expect(callback).toHaveBeenCalledTimes(4)
  })
})
