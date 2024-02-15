import { randomBytes } from "crypto"
import { createReActor } from "../src"
import { idlFactory } from "./candid/backend"

describe("My IC Store and Actions", () => {
  const { queryCall, updateCall } = createReActor({
    canisterId: "xeka7-ryaaa-aaaal-qb57a-cai",
    idlFactory,
  })

  it("should return the symmetric key verification key", async () => {
    const { initialData } = queryCall({
      functionName: "symmetric_key_verification_key",
    })

    const data = await initialData

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
      initialData,
      getState: newGetState,
    } = queryCall({
      functionName: "anonymous_user",
      args: [publicKey],
    })

    expect(newGetState("loading")).toEqual(true)

    await initialData

    expect(newGetState("loading")).toEqual(false)

    const data = await call()

    expect(data).toBeDefined()
  })

  it("should return timers", async () => {
    const { intervalId } = queryCall({
      functionName: "timers",
      autoRefresh: true,
    })

    expect(intervalId).toBeDefined()

    clearInterval(intervalId as NodeJS.Timeout)
  })
})
