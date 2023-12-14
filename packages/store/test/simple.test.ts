import { randomBytes } from "crypto"
import { createReActorStore } from "../src"
import { createActor } from "./candid/backend"

describe("My IC Store and Actions", () => {
  const { resetActorState, initialize, authenticate, callMethod } =
    createReActorStore(
      (agent) => createActor("xeka7-ryaaa-aaaal-qb57a-cai", { agent }),
      {
        host: "https://icp-api.io",
      }
    )

  afterAll(() => {
    resetActorState()
  })

  it("should return the symmetric key verification key", async () => {
    initialize()

    const initialData = await callMethod("symmetric_key_verification_key")

    expect(initialData).toBeDefined()
  })

  it("should return anonymous user data", async () => {
    initialize()

    const mockData = Uint8Array.from(Array(48).fill(0))
    const publicKey = Uint8Array.from(randomBytes(48))

    const index = await callMethod("save_encrypted_text", mockData, [publicKey])

    expect(index).toBeDefined()

    const savedData = await callMethod("user_notes", [publicKey])

    expect(savedData[1][0].text).toEqual(mockData)
  })

  it("should return logged user data", async () => {
    initialize()
    await authenticate()
  })

  it("should return timers", async () => {
    initialize()

    const data = await callMethod("timers")

    expect(data).toBeDefined()
  })
})
