import { Reactor, ClientManager } from "@ic-reactor/core"
import { _SERVICE, idlFactory } from "../declarations/hello_actor"
import { describe, expect, it, beforeAll } from "vitest"
import { QueryClient } from "@tanstack/react-query"

describe("Store Test", () => {
  const queryClient = new QueryClient()
  const clientManager = new ClientManager({
    withCanisterEnv: true,
    agentOptions: {
      verifyQuerySignatures: false,
    },
    queryClient,
  })

  const helloActor = new Reactor<_SERVICE>({
    clientManager,
    idlFactory,
    name: "hello_actor",
  })

  beforeAll(async () => {
    await clientManager.initialize()
  })

  it("should return the correct initial state", async () => {
    expect(helloActor.canisterId.toString()).toEqual(
      process.env.CANISTER_ID_HELLO_ACTOR
    )
    expect((await clientManager.getUserPrincipal()).isAnonymous()).toBe(true)
  })

  it("should call the greet function", async () => {
    const greet = await helloActor.callMethod({
      functionName: "greet",
      args: ["World"],
    })

    expect(greet).toEqual("Hello, World!")
  })

  it("should call the greet_update function", async () => {
    const result = await helloActor.callMethod({
      functionName: "greet_update",
      args: ["World"],
    })

    expect(result).toEqual("Hello, World!")
  })
})
