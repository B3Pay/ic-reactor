import { describe, it, expect, vi } from "vitest"
import { createActorHooks } from "../src"
import { ClientManager, Reactor } from "@ic-reactor/core"
import { renderHook } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React from "react"
import { ActorMethod } from "@icp-sdk/core/agent"
import { Principal } from "@icp-sdk/core/principal"

// Mock IDL factories
const ledgerIdlFactory = ({ IDL }: any) => {
  return IDL.Service({
    icrc1_balance_of: IDL.Func(
      [
        IDL.Record({
          owner: IDL.Principal,
          subaccount: IDL.Opt(IDL.Vec(IDL.Nat8)),
        }),
      ],
      [IDL.Nat],
      ["query"]
    ),
  })
}

const todoIdlFactory = ({ IDL }: any) => {
  return IDL.Service({
    get_todos: IDL.Func([], [IDL.Vec(IDL.Text)], ["query"]),
    add_todo: IDL.Func([IDL.Text], [], []),
  })
}

// Mock Agent/Actor to avoid network calls
vi.mock("@icp-sdk/core/agent", async () => {
  const actual = await vi.importActual<typeof import("@icp-sdk/core/agent")>(
    "@icp-sdk/core/agent"
  )
  return {
    ...actual,
    Actor: class extends actual.Actor {
      static createActor = vi.fn().mockReturnValue({
        icrc1_balance_of: vi.fn(),
        get_todos: vi.fn(),
        add_todo: vi.fn(),
      })
      static canisterIdOf = vi
        .fn()
        .mockReturnValue({ toString: () => "test-canister" })
      static agentOf = vi.fn().mockReturnValue({
        replaceIdentity: vi.fn(),
      })
    },
  }
})

describe("Reactor Multiple Actors Demo", () => {
  it("demonstrates usage of multiple actors (Ledger and Todo)", async () => {
    const queryClient = new QueryClient()
    const clientManager = new ClientManager({ queryClient })

    // Prevent network initialization
    vi.spyOn(ClientManager.prototype, "initializeAgent").mockResolvedValue()

    // 1. Initialize Reactor with multiple actors
    type LedgerActor = {
      icrc1_balance_of: ActorMethod<
        [{ owner: Principal; subaccount: [] }],
        bigint
      >
    }

    type TodoActor = {
      get_todos: ActorMethod<[], string[]>
      add_todo: ActorMethod<[string], void>
    }

    const ledgerActor = new Reactor<LedgerActor>({
      clientManager,
      canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
      idlFactory: ledgerIdlFactory,
      name: "ledger",
    })

    const todoActor = new Reactor<TodoActor>({
      clientManager,
      canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
      idlFactory: todoIdlFactory,
      name: "todo",
    })

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    // 2. Extract hooks for specific actors
    const { useActorQuery: useLedgerQuery } = createActorHooks(ledgerActor)
    const { useActorQuery: useTodoQuery, useActorMutation: useTodoMutation } =
      createActorHooks(todoActor)

    // 3. Verify hooks are correctly assigned and functional (structure check)
    expect(useLedgerQuery).toBeDefined()
    expect(useTodoQuery).toBeDefined()
    expect(useTodoMutation).toBeDefined()

    // 4. Demonstrate using the hooks in a component context (simulated via renderHook)

    // Simulate Ledger Balance Query
    const { result: ledgerResult } = renderHook(
      () =>
        useLedgerQuery({
          functionName: "icrc1_balance_of",
          args: [{ owner: Principal.fromText("aaaaa-aa"), subaccount: [] }],
        }),
      { wrapper }
    )

    // Simulate Todo List Query
    const { result: todoResult } = renderHook(
      () =>
        useTodoQuery({
          functionName: "get_todos",
        }),
      { wrapper }
    )

    // Simulate Todo Update Call
    const { result: todoUpdateResult } = renderHook(
      () =>
        useTodoMutation({
          functionName: "add_todo",
        }),
      { wrapper }
    )

    // Wait for initial loading state or results
    // Since we are mocking the network/agent response in other base tests,
    // here we mostly check that the hook calls don't crash and return expected structure.

    expect(ledgerResult.current).toBeDefined()
    expect(ledgerResult.current.data).toBeUndefined() // Mock returns undefined/null usually if not set up

    expect(todoResult.current).toBeDefined()
    expect(todoUpdateResult.current).toBeDefined()
    expect(todoUpdateResult.current).toHaveProperty("mutate")

    // Validation of structure
    expect(ledgerResult.current).toHaveProperty("refetch")
    expect(todoResult.current).toHaveProperty("refetch")
  })
})
