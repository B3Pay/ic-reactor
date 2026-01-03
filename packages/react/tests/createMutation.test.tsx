import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor, act } from "@testing-library/react"
import React from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createMutation } from "../src/createMutation"
import { ActorMethod } from "@icp-sdk/core/agent"
import { Reactor } from "@ic-reactor/core"

// Define a test actor type with various argument patterns
type TestActor = {
  getUser: ActorMethod<[string], { name: string; age: number }>
  updateUser: ActorMethod<[{ name: string; age: number }], boolean>
  deleteUser: ActorMethod<[string], void>
  // Edge cases for different argument types:
  processNumbers: ActorMethod<[number[]], boolean> // Single array arg (needs tuple wrapper)
  uploadBinary: ActorMethod<[Uint8Array], boolean> // TypedArray (unwrapped, not an Array)
  transfer: ActorMethod<[string, bigint], boolean> // Multiple args (tuple)
}

// Mock Reactor
const createMockReactor = (queryClient: QueryClient) => {
  const callMethod = vi.fn().mockImplementation(async ({ functionName }) => {
    if (functionName === "updateUser") {
      return true
    }
    if (functionName === "deleteUser") {
      return undefined
    }
    if (functionName === "processNumbers") {
      return true
    }
    if (functionName === "uploadBinary") {
      return true
    }
    if (functionName === "transfer") {
      return true
    }
    return null
  })

  return {
    queryClient,
    callMethod,
    generateQueryKey: vi
      .fn()
      .mockImplementation(({ functionName }) => [
        "test-canister",
        functionName,
      ]),
  } as unknown as Reactor<TestActor>
}

describe("createMutation", () => {
  let queryClient: QueryClient
  let mockReactor: ReturnType<typeof createMockReactor>

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0,
        },
      },
    })
    mockReactor = createMockReactor(queryClient)
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  describe("basic functionality", () => {
    it("should create a mutation call with required methods", () => {
      const updateUser = createMutation(mockReactor, {
        functionName: "updateUser",
      })

      expect(updateUser.execute).toBeDefined()
      expect(updateUser.useMutation).toBeDefined()
    })

    it("should execute mutation directly", async () => {
      const updateUser = createMutation(mockReactor, {
        functionName: "updateUser",
      })

      const result = await updateUser.execute([{ name: "John", age: 30 }])

      expect(result).toBe(true)
      expect(mockReactor.callMethod).toHaveBeenCalledWith({
        functionName: "updateUser",
        args: [{ name: "John", age: 30 }],
        callConfig: undefined,
      })
    })

    it("should handle Uint8Array argument (TypedArrays are unwrapped)", async () => {
      const uploadBinary = createMutation(mockReactor, {
        functionName: "uploadBinary",
      })

      const binaryData = new Uint8Array([1, 2, 3, 4])
      await uploadBinary.execute([binaryData])

      expect(mockReactor.callMethod).toHaveBeenCalledWith({
        functionName: "uploadBinary",
        args: [binaryData],
        callConfig: undefined,
      })
    })

    it("should handle array argument (arrays require tuple wrapper)", async () => {
      const processNumbers = createMutation(mockReactor, {
        functionName: "processNumbers",
      })

      // For array args, the type requires passing as tuple [array]
      await processNumbers.execute([[1, 2, 3, 4]])

      expect(mockReactor.callMethod).toHaveBeenCalledWith({
        functionName: "processNumbers",
        args: [[1, 2, 3, 4]],
        callConfig: undefined,
      })
    })

    it("should handle multi-argument tuple", async () => {
      const transfer = createMutation(mockReactor, {
        functionName: "transfer",
      })

      // Multiple args passed as tuple
      await transfer.execute(["recipient", 100n])

      expect(mockReactor.callMethod).toHaveBeenCalledWith({
        functionName: "transfer",
        args: ["recipient", 100n],
        callConfig: undefined,
      })
    })
  })

  describe("useMutation hook", () => {
    it("should execute mutation via hook", async () => {
      const updateUser = createMutation(mockReactor, {
        functionName: "updateUser",
      })

      const { result } = renderHook(() => updateUser.useMutation(), {
        wrapper,
      })

      await act(async () => {
        result.current.mutate([{ name: "John", age: 30 }])
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(mockReactor.callMethod).toHaveBeenCalledWith({
        functionName: "updateUser",
        args: [{ name: "John", age: 30 }],
        callConfig: undefined,
      })
    })

    it("should handle factory callbacks", async () => {
      const onSuccess = vi.fn()
      const updateUser = createMutation(mockReactor, {
        functionName: "updateUser",
        onSuccess,
      })

      const { result } = renderHook(() => updateUser.useMutation(), {
        wrapper,
      })

      await act(async () => {
        result.current.mutate([{ name: "John", age: 30 }])
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(onSuccess).toHaveBeenCalled()
    })

    it("should handle hook-specific callbacks", async () => {
      const factoryOnSuccess = vi.fn()
      const hookOnSuccess = vi.fn()

      const updateUser = createMutation(mockReactor, {
        functionName: "updateUser",
        onSuccess: factoryOnSuccess,
      })

      const { result } = renderHook(
        () =>
          updateUser.useMutation({
            onSuccess: hookOnSuccess,
          }),
        {
          wrapper,
        }
      )

      await act(async () => {
        result.current.mutate([{ name: "John", age: 30 }])
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(factoryOnSuccess).toHaveBeenCalled()
      expect(hookOnSuccess).toHaveBeenCalled()
    })
  })

  describe("refetchQueries", () => {
    it("should refetch queries on success", async () => {
      const refetchSpy = vi.spyOn(queryClient, "refetchQueries")

      const updateUser = createMutation(mockReactor, {
        functionName: "updateUser",
        refetchQueries: [["test-canister", "getUser"]],
      })

      const { result } = renderHook(() => updateUser.useMutation(), {
        wrapper,
      })

      await act(async () => {
        result.current.mutate([{ name: "John", age: 30 }])
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(refetchSpy).toHaveBeenCalledWith({
        queryKey: ["test-canister", "getUser"],
      })
    })
  })
})
