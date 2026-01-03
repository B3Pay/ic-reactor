import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import React from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useActorQuery } from "./useActorQuery"
import { ActorMethod } from "@icp-sdk/core/agent"
import { Reactor } from "@ic-reactor/core"

// Define a test actor type
type TestActor = {
  greet: ActorMethod<[], string>
  greetWithName: ActorMethod<[string], string>
  getCount: ActorMethod<[], bigint>
}

// Mock Reactor
const createMockReactor = (queryClient: QueryClient): Reactor<TestActor> =>
  ({
    queryClient,
    getQueryOptions: vi.fn().mockImplementation(({ functionName, args }) => ({
      queryKey: ["test-canister", functionName, ...(args || [])],
      queryFn: vi.fn().mockImplementation(async () => {
        if (functionName === "greet") return "Hello, World!"
        if (functionName === "greetWithName")
          return `Hello, ${args?.[0] || "Guest"}!`
        if (functionName === "getCount") return BigInt(42)
        return null
      }),
    })),
  }) as unknown as Reactor<TestActor>

describe("useActorQuery", () => {
  let queryClient: QueryClient
  let mockReactor: Reactor<TestActor>

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })
    mockReactor = createMockReactor(queryClient)
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  describe("basic functionality", () => {
    it("should fetch data without select", async () => {
      const { result } = renderHook(
        () =>
          useActorQuery<TestActor, "greet">({
            reactor: mockReactor,
            functionName: "greet",
          }),
        { wrapper }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toBe("Hello, World!")
    })

    it("should pass args to the query", async () => {
      const { result } = renderHook(
        () =>
          useActorQuery<TestActor, "greetWithName">({
            reactor: mockReactor,
            functionName: "greetWithName",
            args: ["Alice"],
          }),
        { wrapper }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toBe("Hello, Alice!")
      expect(mockReactor.getQueryOptions).toHaveBeenCalledWith({
        callConfig: undefined,
        functionName: "greetWithName",
        args: ["Alice"],
      })
    })

    it("should handle bigint return types", async () => {
      const { result } = renderHook(
        () =>
          useActorQuery<TestActor, "getCount">({
            reactor: mockReactor,
            functionName: "getCount",
          }),
        { wrapper }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toBe(BigInt(42))
    })
  })

  describe("select function", () => {
    it("should transform data with select function", async () => {
      const { result } = renderHook(
        () =>
          useActorQuery<TestActor, "greet", "candid", number>({
            reactor: mockReactor,
            functionName: "greet",
            select: (data: string) => data.length,
          }),
        { wrapper }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      // "Hello, World!" has 13 characters
      expect(result.current.data).toBe(13)
    })

    it("should transform data to different type with select", async () => {
      const { result } = renderHook(
        () =>
          useActorQuery<TestActor, "greet", "candid", { message: string }>({
            reactor: mockReactor,
            functionName: "greet",
            select: (data: string) => ({ message: data }),
          }),
        { wrapper }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toEqual({ message: "Hello, World!" })
    })

    it("should transform bigint to number with select", async () => {
      const { result } = renderHook(
        () =>
          useActorQuery<TestActor, "getCount", "candid", number>({
            reactor: mockReactor,
            functionName: "getCount",
            select: (data: bigint) => Number(data),
          }),
        { wrapper }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toBe(42)
      expect(typeof result.current.data).toBe("number")
    })

    it("should work with array transformation in select", async () => {
      const { result } = renderHook(
        () =>
          useActorQuery<TestActor, "greet", "candid", string[]>({
            reactor: mockReactor,
            functionName: "greet",
            select: (data: string) => data.split(", "),
          }),
        { wrapper }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toEqual(["Hello", "World!"])
    })
  })

  describe("query options", () => {
    it("should respect enabled: false option", async () => {
      const { result } = renderHook(
        () =>
          useActorQuery<TestActor, "greet">({
            reactor: mockReactor,
            functionName: "greet",
            enabled: false,
          }),
        { wrapper }
      )

      // Should stay in pending state
      expect(result.current.isPending).toBe(true)
      expect(result.current.fetchStatus).toBe("idle")
      expect(result.current.data).toBeUndefined()
    })

    it("should use custom staleTime", async () => {
      const { result } = renderHook(
        () =>
          useActorQuery<TestActor, "greet">({
            reactor: mockReactor,
            functionName: "greet",
            staleTime: 1000 * 60 * 10, // 10 minutes
          }),
        { wrapper }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.isStale).toBe(false)
    })
  })

  describe("type inference", () => {
    it("should infer string type for greet method without select", async () => {
      const { result } = renderHook(
        () =>
          useActorQuery<TestActor, "greet">({
            reactor: mockReactor,
            functionName: "greet",
          }),
        { wrapper }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      // TypeScript should infer data as string
      const data: string | undefined = result.current.data
      expect(typeof data).toBe("string")
    })

    it("should infer number type when select returns number", async () => {
      const { result } = renderHook(
        () =>
          useActorQuery({
            reactor: mockReactor,
            functionName: "greet",
            select: (data: any) => data.length,
          }),
        { wrapper }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      // TypeScript should infer data as number
      const data: number | undefined = result.current.data
      expect(typeof data).toBe("number")
    })
  })

  describe("refetching", () => {
    it("should support manual refetch", async () => {
      const { result } = renderHook(
        () =>
          useActorQuery<TestActor, "greet">({
            reactor: mockReactor,
            functionName: "greet",
          }),
        { wrapper }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      // Refetch should be available
      expect(typeof result.current.refetch).toBe("function")

      await result.current.refetch()

      expect(result.current.isSuccess).toBe(true)
    })
  })
})
