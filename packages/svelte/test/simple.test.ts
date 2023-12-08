import { randomBytes } from "crypto"
import { createReActorStore } from "../src"
import { idlFactory } from "./candid/backend"

describe("My IC Store and Actions", () => {
  const { actions } = createReActorStore({
    canisterId: "xeka7-ryaaa-aaaal-qb57a-cai",
    idlFactory: idlFactory,
    options: {
      agentOptions: {
        host: "https://icp-api.io",
      },
    },
  })

  afterAll(() => {
    actions.resetState()
  })

  it("should return the symmetric key verification key", async () => {
    actions.initialize()

    const initialData = await actions.callMethod(
      "symmetric_key_verification_key"
    )

    expect(initialData).toBeDefined()
  })

  it("should return anonymous user data", async () => {
    actions.initialize()

    const mockData = Uint8Array.from(Array(48).fill(0))
    const publicKey = Uint8Array.from(randomBytes(48))

    const index = await actions.callMethod("save_encrypted_text", mockData, [
      publicKey,
    ])

    expect(index).toBeDefined()

    const savedData = await actions.callMethod("user_notes", [publicKey])

    expect(savedData[1][0].text).toEqual(mockData)
  })

  it("should return logged user data", async () => {
    actions.initialize()
    await actions.authenticate()
  })

  it("should return timers", async () => {
    actions.initialize()

    const data = await actions.callMethod("timers")

    expect(data).toBeDefined()
  })
})
