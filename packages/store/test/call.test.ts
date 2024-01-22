import { randomBytes } from "crypto"
import { idlFactory } from "./candid/backend"
import { _SERVICE } from "./candid/backend/backend.did"
import { AgentManager, ActorManager } from "../src"

describe("My IC Store and Actions", () => {
  const agentManager = new AgentManager({
    host: "https://ic0.app",
    withDevtools: false,
  })

  const { callMethod } = new ActorManager({
    agentManager,
    idlFactory,
    canisterId: "xeka7-ryaaa-aaaal-qb57a-cai",
  })

  it("should return the symmetric key verification key", async () => {
    const key = await callMethod("symmetric_key_verification_key")

    expect(key).toBeDefined()
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
    await agentManager.authenticate()
  })

  it("should return timers", async () => {
    const data = await callMethod("timers")

    expect(data).toBeDefined()
  })
})
