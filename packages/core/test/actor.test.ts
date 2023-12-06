import { Cbor } from "@dfinity/agent"
import { IDL } from "@dfinity/candid"
import fetchMock from "jest-fetch-mock"
import createReActor from "../src"
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

describe("Initialize", () => {
  const callback = jest.fn()

  const { initializeActor, store, updateCall, queryCall } = createReActor(
    (agent) => {
      return createActor("bd3sg-teaaa-aaaaa-qaaba-cai", {
        agent,
      })
    },
    {
      initializeOnMount: false,
      verifyQuerySignatures: false,
      host: "https://local-mock",
    }
  )

  const { subscribe, getState } = store

  subscribe(callback)

  it("should initialize the actor", () => {
    expect(getState().initialized).toEqual(false)
    initializeActor()

    expect(getState().initialized).toEqual(true)
    expect(callback).toHaveBeenCalledTimes(2)
  })

  it("should queryCall the query method", async () => {
    const { requestHash, initialData, recall, getState } = queryCall({
      functionName: "greet",
      args: ["World"],
    })
    expect(requestHash).toEqual(
      "c102685369c5e29182d7457bd5af52486928280f000dfe641db598b82c5753e0"
    )

    const data = await initialData
    expect(data).toEqual(canisterDecodedReturnValue)

    expect(getState()).toEqual({
      data: canisterDecodedReturnValue,
      loading: false,
      error: undefined,
    })
    const res = recall()

    expect(res).resolves.toEqual(canisterDecodedReturnValue)
  })

  it("should subscribe to the actor state", () => {
    expect(callback).toHaveBeenCalledTimes(7)
  })

  it("should updateCall the query method", async () => {
    const { requestHash, call, getState } = updateCall({
      functionName: "greet",
      args: ["World"],
    })

    expect(requestHash).toEqual(
      "c102685369c5e29182d7457bd5af52486928280f000dfe641db598b82c5753e0"
    )

    const loadingBefore = getState("loading")
    expect(loadingBefore).toEqual(false)

    const result = call()

    const loadingAfter = getState("loading")
    expect(loadingAfter).toEqual(true)

    const data = await result
    expect(data).toEqual(canisterDecodedReturnValue)

    expect(getState()).toEqual({
      data: canisterDecodedReturnValue,
      loading: false,
      error: undefined,
    })
  })

  it("should subscribe to the actor state", () => {
    expect(callback).toHaveBeenCalledTimes(10)
  })
})
