import { randomBytes } from "crypto"
import { idlFactory, backend } from "./candid/backend"
import { AgentManager, ActorManager } from "../src"
import { IC_HOST_NETWORK_URI } from "../src/tools"

describe("My IC Store and Actions", () => {
  const agentManager = new AgentManager({
    host: IC_HOST_NETWORK_URI,
  })

  const { callMethod } = new ActorManager<typeof backend>({
    agentManager,
    idlFactory,
    canisterId: "xeka7-ryaaa-aaaal-qb57a-cai",
  })

  it("should return the symmetric key verification key", async () => {
    const key = await callMethod("symmetric_key_verification_key")

    expect(key).toBeDefined()
  })

  const mockData = Uint8Array.from(Array(48).fill(0))
  const publicKey = Uint8Array.from(randomBytes(48))

  it("should return anonymous user data", async () => {
    const index = await callMethod("save_encrypted_text", mockData, [publicKey])

    expect(index).toBeDefined()

    const savedData = await callMethod("user_notes", [publicKey])

    expect(savedData[1][0].text).toEqual(mockData)
  })

  it("should return logged user data", async () => {
    await agentManager.authenticate()
  })

  it("should return timers", async () => {
    const data = await callMethod("timers")

    expect(data).toBeDefined()
  })

  it("should transfrom", async () => {
    const data = await callMethod("anonymous_user_notes", publicKey)

    expect(data).toBeDefined()
  })
})
