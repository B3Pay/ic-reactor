import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import React, { Suspense } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useActorSuspenseQuery } from "./useActorSuspenseQuery"
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

describe("useActorSuspenseQuery", () => {
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
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={<div>Loading...</div>}>{children}</Suspense>
    </QueryClientProvider>
  )

  describe("basic functionality", () => {
    it("should fetch data with suspense", async () => {
      const { result } = renderHook(
        () =>
          useActorSuspenseQuery<TestActor, "greet">({
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
          useActorSuspenseQuery<TestActor, "greetWithName">({
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
          useActorSuspenseQuery<TestActor, "getCount">({
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
          useActorSuspenseQuery<TestActor, "greet", "candid", number>({
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
          useActorSuspenseQuery<
            TestActor,
            "greet",
            "candid",
            { message: string }
          >({
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
          useActorSuspenseQuery<TestActor, "getCount", "candid", number>({
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
  })

  describe("query options", () => {
    it("should use custom staleTime", async () => {
      const { result } = renderHook(
        () =>
          useActorSuspenseQuery<TestActor, "greet">({
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

  describe("suspense behavior", () => {
    it("should always return data (no undefined) when successful", async () => {
      const { result } = renderHook(
        () =>
          useActorSuspenseQuery<TestActor, "greet">({
            reactor: mockReactor,
            functionName: "greet",
          }),
        { wrapper }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      // Suspense queries always have data when rendered
      expect(result.current.data).toBeDefined()
      expect(result.current.data).toBe("Hello, World!")
    })

    it("should have status 'success' when data is available", async () => {
      const { result } = renderHook(
        () =>
          useActorSuspenseQuery<TestActor, "greet">({
            reactor: mockReactor,
            functionName: "greet",
          }),
        { wrapper }
      )

      await waitFor(() => {
        expect(result.current.status).toBe("success")
      })
    })
  })

  describe("refetching", () => {
    it("should support manual refetch", async () => {
      const { result } = renderHook(
        () =>
          useActorSuspenseQuery<TestActor, "greet">({
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
