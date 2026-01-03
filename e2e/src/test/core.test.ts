// @vitest-environment node
import { Reactor, ClientManager } from "@ic-reactor/core"
import { idlFactory, hello_actor } from "../declarations/hello_actor/index.js"
import { describe, expect, it, beforeAll } from "vitest"
import { QueryClient } from "@tanstack/react-query"
import { createActor } from "../declarations/hello_actor/index.js"

describe("Core Function and Sanity Test", () => {
  const queryClient = new QueryClient()
  const clientManager = new ClientManager({
    agentOptions: {
      verifyQuerySignatures: false,
    },
    withProcessEnv: true,
    queryClient,
  })

  // Use env var directly for reliability
  const canisterId = process.env.CANISTER_ID_HELLO_ACTOR!

  const helloReactor = new Reactor<typeof hello_actor>({
    clientManager,
    canisterId,
    idlFactory,
    name: "hello_actor",
  })

  beforeAll(async () => {
    await clientManager.initialize()
  })

  it("Sanity check: Raw Agent call should work", async () => {
    // Create actor manually using the same agent
    const actor = createActor(canisterId, {
      agent: clientManager.agent,
    })

    const res = await actor.greet("World")
    expect(res).toBe("Hello, World!")
  })

  it("should initialize the actor", () => {
    expect(helloReactor).toBeDefined()
    expect(helloReactor.canisterId.toString()).toEqual(canisterId)
  })

  it("should call the greet function", async () => {
    const greet = await helloReactor.callMethod({
      functionName: "greet",
      args: ["World"],
    })

    expect(greet).toEqual("Hello, World!")
  })

  it("should call the greet_update function", async () => {
    const result = await helloReactor.callMethod({
      functionName: "greet_update",
      args: ["World"],
    })

    expect(result).toEqual("Hello, World!")
  })
})
