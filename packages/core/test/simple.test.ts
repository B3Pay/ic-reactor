import { randomBytes } from "crypto"
import { createReActor } from "../src"
import { createActor } from "./candid/backend"

describe("My IC Store and Actions", () => {
  const { actions, initializeActor, queryCall, updateCall } = createReActor(
    (agent) => createActor("xeka7-ryaaa-aaaal-qb57a-cai", { agent }),
    {
      host: "https://icp-api.io",
    }
  )

  afterAll(() => {
    actions.resetState()
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

    const { call, getState } = updateCall({
      functionName: "save_encrypted_text",
      args: [mockData, [publicKey]],
    })

    const index = await call()

    expect(index).toBeDefined()

    const stateIndex = getState("data")

    expect(stateIndex).toEqual(index)

    const {
      recall,
      initialData,
      getState: newGetState,
    } = queryCall({
      functionName: "anonymous_user",
      args: [publicKey],
    })

    expect(newGetState("loading")).toEqual(true)

    await initialData

    expect(newGetState("loading")).toEqual(false)

    const data = await recall()

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
