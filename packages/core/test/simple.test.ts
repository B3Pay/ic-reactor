import { randomBytes } from "crypto"
import { createReActor } from "../src"
import { backend, idlFactory } from "./candid/backend"

describe("My IC Store and Actions", () => {
  const { queryCall, updateCall } = createReActor<typeof backend>({
    canisterId: "xeka7-ryaaa-aaaal-qb57a-cai",
    idlFactory,
  })

  it("should return the symmetric key verification key", async () => {
    const { dataPromise } = queryCall({
      functionName: "symmetric_key_verification_key",
    })

    const data = await dataPromise

    expect(data).toBeDefined()
  })

  it("should return anonymous user data", async () => {
    const mockData = Uint8Array.from(Array(48).fill(0))
    const publicKey = Uint8Array.from(randomBytes(48))

    const { call: save_encrypted_text, getState } = updateCall({
      functionName: "save_encrypted_text",
      args: [mockData, [publicKey]],
    })

    const index = await save_encrypted_text()

    expect(index).toBeDefined()

    const stateIndex = getState("data")

    expect(stateIndex).toEqual(index)

    const {
      call,
      dataPromise,
      getState: userState,
    } = queryCall({
      functionName: "anonymous_user_notes",
      args: [publicKey],
      refetchOnMount: true,
    })

    expect(userState("loading")).toEqual(true)

    const data = await dataPromise
    console.log(data)
    const stateData = userState()

    expect(data).toEqual(stateData)

    expect(userState("loading")).toEqual(false)

    const recallData = await call()

    expect(recallData).toBeDefined()
  })

  it("should return timers", async () => {
    const { intervalId, dataPromise } = queryCall({
      functionName: "timers",
      refetchOnMount: true,
      refetchInterval: 1000,
    })

    expect(intervalId).toBeDefined()
    expect(await dataPromise).toBeDefined()

    clearInterval(intervalId as NodeJS.Timeout)
  })
})
