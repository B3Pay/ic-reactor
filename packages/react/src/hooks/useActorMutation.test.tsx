import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook } from "@testing-library/react"
import React from "react"
import { ClientManager, Reactor } from "@ic-reactor/core"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Actor, ActorMethod } from "@icp-sdk/core/agent"
import { useActorMutation } from "./useActorMutation"

// Mock IDL factory
const idlFactory = ({ IDL }: any) => {
  return IDL.Service({
    create_user: IDL.Func(
      [IDL.Record({ name: IDL.Text })],
      [IDL.Record({ id: IDL.Text, name: IDL.Text })],
      ["update"]
    ),
    update_user: IDL.Func(
      [IDL.Record({ id: IDL.Text, name: IDL.Text })],
      [IDL.Record({ id: IDL.Text, name: IDL.Text })],
      ["update"]
    ),
    delete_user: IDL.Func([IDL.Text], [IDL.Bool], ["update"]),
  })
}

// Define Actor Interface
interface CreateUserInput {
  name: string
}

interface UpdateUserInput {
  id: string
  name: string
}

interface User {
  id: string
  name: string
}

// Actor type with methods
interface TestActor {
  get_user: ActorMethod<[string], User>
  create_user: ActorMethod<[CreateUserInput], User>
  update_user: ActorMethod<[UpdateUserInput], User>
  delete_user: ActorMethod<[string], boolean>
}

// Mock data
const mockUserCreated: User = { id: "user-1", name: "Alice" }
const mockUserUpdated: User = { id: "user-1", name: "Bob" }

// Mock Actor.createActor
vi.mock("@icp-sdk/core/agent", async () => {
  const actual = await vi.importActual<typeof import("@icp-sdk/core/agent")>(
    "@icp-sdk/core/agent"
  )
  return {
    ...actual,
    Actor: class extends actual.Actor {
      static createActor = vi.fn()
      static canisterIdOf = vi.fn().mockReturnValue({
        toString: () => "test-canister-id",
      })
      static interfaceOf = vi.fn().mockReturnValue({
        _fields: [],
      })
    },
  }
})

describe("useActorMutation", () => {
  let queryClient: QueryClient
  let clientManager: ClientManager
  let mockActor: TestActor
  let reactor: Reactor<TestActor>

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        mutations: {
          retry: false,
        },
      },
    })

    clientManager = new ClientManager({ queryClient })

    // Setup mock actor
    mockActor = {
      create_user: vi.fn().mockResolvedValue(mockUserCreated),
      update_user: vi.fn().mockResolvedValue(mockUserUpdated),
      delete_user: vi.fn().mockResolvedValue(true),
    } as unknown as TestActor
    ;(Actor.createActor as any).mockReturnValue(mockActor)

    reactor = new Reactor<TestActor>({
      clientManager,
      canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
      idlFactory,
      name: "test",
    })
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  describe("basic functionality", () => {
    it("should create a mutation hook", () => {
      const { result } = renderHook(
        () =>
          useActorMutation({
            reactor,
            functionName: "create_user",
          }),
        { wrapper }
      )

      expect(result.current).toBeDefined()
    })

    it("should return correct hook structure", () => {
      const { result } = renderHook(
        () =>
          useActorMutation({
            reactor,
            functionName: "create_user",
          }),
        { wrapper }
      )

      expect(result.current.mutate).toBeInstanceOf(Function)
      expect(result.current.mutateAsync).toBeInstanceOf(Function)
      expect(typeof result.current.isPending).toBe("boolean")
      expect(typeof result.current.isSuccess).toBe("boolean")
      expect(typeof result.current.isError).toBe("boolean")
    })

    it("should have correct initial state", () => {
      const { result } = renderHook(
        () =>
          useActorMutation({
            reactor,
            functionName: "create_user",
          }),
        { wrapper }
      )

      expect(result.current.isPending).toBe(false)
      expect(result.current.isSuccess).toBe(false)
      expect(result.current.isError).toBe(false)
      expect(result.current.data).toBeUndefined()
    })
  })

  describe("hook options", () => {
    it("should accept mutation options like onSuccess and onError", () => {
      const onSuccess = vi.fn()
      const onError = vi.fn()

      const { result } = renderHook(
        () =>
          useActorMutation({
            reactor,
            functionName: "create_user",
            onSuccess,
            onError,
          }),
        { wrapper }
      )

      expect(result.current.mutate).toBeInstanceOf(Function)
    })

    it("should expose mutate and mutateAsync methods", () => {
      const { result } = renderHook(
        () =>
          useActorMutation({
            reactor,
            functionName: "create_user",
          }),
        { wrapper }
      )

      expect(result.current.mutate).toBeInstanceOf(Function)
      expect(result.current.mutateAsync).toBeInstanceOf(Function)
    })
  })

  describe("refetchQueries functionality", () => {
    it("should accept refetchQueries option", () => {
      const { result } = renderHook(
        () =>
          useActorMutation({
            reactor,
            functionName: "update_user",
            refetchQueries: [["test-canister", "get_user"]],
          }),
        { wrapper }
      )

      expect(result.current.mutate).toBeInstanceOf(Function)
    })

    it("should support refetchQueries with args", () => {
      const { result } = renderHook(
        () =>
          useActorMutation({
            reactor,
            functionName: "update_user",
            refetchQueries: [["test-canister", "get_user", "user-1"]],
          }),
        { wrapper }
      )

      expect(result.current.mutate).toBeInstanceOf(Function)
    })
  })
})
