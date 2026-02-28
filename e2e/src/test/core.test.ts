// @vitest-environment node
import { Reactor, ClientManager } from "@ic-reactor/core"
import { idlFactory, _SERVICE } from "../index.js"
import { describe, expect, it, beforeAll } from "vitest"
import { QueryClient } from "@tanstack/react-query"

describe("Core Function and Sanity Test", () => {
  const queryClient = new QueryClient()
  const clientManager = new ClientManager({
    agentOptions: {
      verifyQuerySignatures: false,
    },
    withProcessEnv: true,
    queryClient,
  })

  const helloReactor = new Reactor<_SERVICE>({
    clientManager,
    canisterId: process.env.CANISTER_ID_HELLO_ACTOR!,
    idlFactory,
    name: "hello_actor",
  })

  beforeAll(async () => {
    await clientManager.initialize()
  })

  it("should initialize the actor", () => {
    expect(helloReactor).toBeDefined()
    expect(helloReactor.canisterId.toString()).toEqual(
      process.env.CANISTER_ID_HELLO_ACTOR
    )
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
