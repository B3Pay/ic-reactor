import { randomBytes } from "crypto"
import { createReActorStore } from "../src"
import { idlFactory } from "./candid/backend"
import { _SERVICE } from "./candid/backend/backend.did"

describe("My IC Store and Actions", () => {
  const { actorStore, authenticate, callMethod } = createReActorStore<_SERVICE>(
    {
      idlFactory,
      canisterId: "xeka7-ryaaa-aaaal-qb57a-cai",
      host: "https://icp-api.io",
    }
  )

  it("should return the symmetric key verification key", async () => {
    const initialData = await callMethod("symmetric_key_verification_key")

    expect(initialData).toBeDefined()
  })

  it("should return anonymous user data", async () => {
    const mockData = Uint8Array.from(Array(48).fill(0))
    const publicKey = Uint8Array.from(randomBytes(48))

    const index = await callMethod("save_encrypted_text", mockData, [publicKey])

    expect(index).toBeDefined()

    const savedData = await callMethod("user_notes", [publicKey])

    expect(savedData[1][0].text).toEqual(mockData)
  })

  it("should return logged user data", async () => {
    await authenticate()
  })

  it("should return timers", async () => {
    const data = await callMethod("timers")

    expect(data).toBeDefined()
  })
})
