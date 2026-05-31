import { describe, it, expect } from "vitest"
import { ClientManager, Reactor, DisplayReactor } from "@ic-reactor/core"
import { QueryClient } from "@tanstack/react-query"
import { defineReactor } from "./defineReactor"
import { ActorMethod } from "@icp-sdk/core/agent"

const idlFactory = ({ IDL }: any) =>
  IDL.Service({
    greet: IDL.Func([IDL.Text], [IDL.Text], ["query"]),
  })

interface TestActor {
  greet: ActorMethod<[string], string>
}

const baseConfig = {
  name: "test",
  idlFactory,
  canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
}

describe("defineReactor", () => {
  it("bootstraps a standard Reactor with hooks and infrastructure", () => {
    const result = defineReactor<TestActor>(baseConfig)

    expect(result.reactor).toBeInstanceOf(Reactor)
    expect(result.reactor).not.toBeInstanceOf(DisplayReactor)
    expect(result.clientManager).toBeInstanceOf(ClientManager)
    expect(result.queryClient).toBeInstanceOf(QueryClient)
    expect(typeof result.useActorQuery).toBe("function")
    expect(typeof result.useActorMutation).toBe("function")
  })

  it("creates a DisplayReactor when display is true", () => {
    const result = defineReactor<TestActor>({ ...baseConfig, display: true })

    expect(result.reactor).toBeInstanceOf(DisplayReactor)
  })

  it("wires the reactor to the created ClientManager and QueryClient", () => {
    const { reactor, clientManager, queryClient } =
      defineReactor<TestActor>(baseConfig)

    expect(reactor.clientManager).toBe(clientManager)
    expect(clientManager.queryClient).toBe(queryClient)
  })

  it("reuses an existing ClientManager and its QueryClient", () => {
    const queryClient = new QueryClient()
    const clientManager = new ClientManager({ queryClient })

    const result = defineReactor<TestActor>({ ...baseConfig, clientManager })

    expect(result.clientManager).toBe(clientManager)
    expect(result.queryClient).toBe(queryClient)
    expect(result.reactor.clientManager).toBe(clientManager)
  })

  it("lets multiple reactors share one ClientManager", () => {
    const ledger = defineReactor<TestActor>({ ...baseConfig, name: "ledger" })
    const index = defineReactor<TestActor>({
      ...baseConfig,
      name: "index",
      clientManager: ledger.clientManager,
    })

    expect(index.clientManager).toBe(ledger.clientManager)
    expect(index.reactor).not.toBe(ledger.reactor)
  })
})
