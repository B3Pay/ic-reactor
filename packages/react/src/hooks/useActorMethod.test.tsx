import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import React from "react"
import { ClientManager, Reactor } from "@ic-reactor/core"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useActorMethod } from "./useActorMethod"
import { ActorMethod } from "@icp-sdk/core/agent"

const idlFactory = ({ IDL }: any) => {
  return IDL.Service({
    greet: IDL.Func([IDL.Text], [IDL.Text], ["query"]),
    transfer: IDL.Func(
      [IDL.Record({ to: IDL.Text, amount: IDL.Nat })],
      [IDL.Bool],
      []
    ),
  })
}

interface TestActor {
  greet: ActorMethod<[string], string>
  transfer: ActorMethod<[{ to: string; amount: bigint }], boolean>
}

describe("useActorMethod", () => {
  let queryClient: QueryClient
  let clientManager: ClientManager
  let reactor: Reactor<TestActor>

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })

    clientManager = new ClientManager({
      queryClient,
    })

    reactor = new Reactor<TestActor>({
      clientManager,
      canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
      idlFactory,
      name: "test",
    })

    // Mock reactor.callMethod instead of the entire agent stack
    vi.spyOn(reactor, "callMethod").mockImplementation(
      async ({ functionName, args }: any): Promise<any> => {
        if (functionName === "greet") {
          return `Hello, ${args[0]}!`
        }
        if (functionName === "transfer") {
          return true
        }
        return null
      }
    )
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  it("should detect query method and auto-fetch", async () => {
    const { result } = renderHook(
      () =>
        useActorMethod({
          reactor,
          functionName: "greet",
          args: ["world"],
        }),
      { wrapper }
    )

    expect(result.current.isQuery).toBe(true)
    expect(result.current.functionType).toBe("query")

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBe("Hello, world!")
    expect(reactor.callMethod).toHaveBeenCalled()
  })

  it("should detect update method and not auto-fetch", async () => {
    const { result } = renderHook(
      () =>
        useActorMethod({
          reactor,
          functionName: "transfer",
        }),
      { wrapper }
    )

    expect(result.current.isQuery).toBe(false)
    expect(result.current.functionType).toBe("update")
    expect(result.current.isPending).toBe(false)
    expect(reactor.callMethod).not.toHaveBeenCalled()
  })

  it("should call update method when 'call' is invoked", async () => {
    const { result } = renderHook(
      () =>
        useActorMethod({
          reactor,
          functionName: "transfer",
        }),
      { wrapper }
    )

    const transferArgs = { to: "alice", amount: 100n }
    await result.current.call([transferArgs])

    expect(reactor.callMethod).toHaveBeenCalled()
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBe(true)
  })

  it("should call onSuccess callback", async () => {
    const onSuccess = vi.fn()

    renderHook(
      () =>
        useActorMethod({
          reactor,
          functionName: "greet",
          args: ["admin"],
          onSuccess,
        }),
      { wrapper }
    )

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith("Hello, admin!"))
  })

  it("should invalidate queries on successful mutation", async () => {
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

    const queryKey = ["test-key"]
    const { result } = renderHook(
      () =>
        useActorMethod({
          reactor,
          functionName: "transfer",
          invalidateQueries: [queryKey],
        }),
      { wrapper }
    )

    await result.current.call([{ to: "bob", amount: 50n }])

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey })
  })
})

describe("useActorMethod - Query Method Options", () => {
  let queryClient: QueryClient
  let clientManager: ClientManager
  let reactor: Reactor<TestActor>

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })

    clientManager = new ClientManager({
      queryClient,
    })

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

  it("should respect enabled=false option for query methods", async () => {
    vi.spyOn(reactor, "callMethod").mockResolvedValue("Hello!")

    const { result } = renderHook(
      () =>
        useActorMethod({
          reactor,
          functionName: "greet",
          args: ["world"],
          enabled: false,
        }),
      { wrapper }
    )

    expect(result.current.isQuery).toBe(true)
    expect(result.current.isLoading).toBe(false)
    expect(reactor.callMethod).not.toHaveBeenCalled()
  })

  it("should respect staleTime option for query methods", async () => {
    vi.spyOn(reactor, "callMethod").mockResolvedValue("Hello!")

    const { result } = renderHook(
      () =>
        useActorMethod({
          reactor,
          functionName: "greet",
          args: ["world"],
          staleTime: 60000, // 1 minute
        }),
      { wrapper }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBe("Hello!")
  })

  it("should respect refetchInterval option for query methods", async () => {
    let callCount = 0
    vi.spyOn(reactor, "callMethod").mockImplementation(async () => {
      callCount++
      return `Hello ${callCount}!`
    })

    const { result } = renderHook(
      () =>
        useActorMethod({
          reactor,
          functionName: "greet",
          args: ["world"],
          refetchInterval: 100, // 100ms
        }),
      { wrapper }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(callCount).toBeGreaterThanOrEqual(1)

    // Wait for refetch interval to trigger
    await waitFor(() => expect(callCount).toBeGreaterThan(1), { timeout: 500 })
  })

  it("should support refetch for query methods", async () => {
    let callCount = 0
    vi.spyOn(reactor, "callMethod").mockImplementation(async () => {
      callCount++
      return `Hello ${callCount}!`
    })

    const { result } = renderHook(
      () =>
        useActorMethod({
          reactor,
          functionName: "greet",
          args: ["world"],
        }),
      { wrapper }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBe("Hello 1!")

    // Call refetch
    await result.current.refetch()

    await waitFor(() => expect(result.current.data).toBe("Hello 2!"))
    expect(callCount).toBe(2)
  })

  it("should support reset for query methods", async () => {
    vi.spyOn(reactor, "callMethod").mockResolvedValue("Hello!")

    const { result } = renderHook(
      () =>
        useActorMethod({
          reactor,
          functionName: "greet",
          args: ["world"],
        }),
      { wrapper }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBe("Hello!")

    // Reset the query
    result.current.reset()

    // Data should be undefined after reset
    await waitFor(() => {
      const queryState = queryClient.getQueryState(
        reactor.generateQueryKey({ functionName: "greet", args: ["world"] })
      )
      expect(queryState).toBeUndefined()
    })
  })

  it("should expose queryResult for query methods", async () => {
    vi.spyOn(reactor, "callMethod").mockResolvedValue("Hello!")

    const { result } = renderHook(
      () =>
        useActorMethod({
          reactor,
          functionName: "greet",
          args: ["world"],
        }),
      { wrapper }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // queryResult should be available for query methods
    expect(result.current.queryResult).toBeDefined()
    expect(result.current.queryResult?.data).toBe("Hello!")
    expect(result.current.mutationResult).toBeUndefined()
  })
})

describe("useActorMethod - Mutation Method Options", () => {
  let queryClient: QueryClient
  let clientManager: ClientManager
  let reactor: Reactor<TestActor>

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })

    clientManager = new ClientManager({
      queryClient,
    })

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

  it("should support reset for mutation methods", async () => {
    vi.spyOn(reactor, "callMethod").mockResolvedValue(true)

    const { result } = renderHook(
      () =>
        useActorMethod({
          reactor,
          functionName: "transfer",
        }),
      { wrapper }
    )

    await result.current.call([{ to: "alice", amount: 100n }])

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBe(true)

    // Reset the mutation
    result.current.reset()

    await waitFor(() => expect(result.current.data).toBeUndefined())
    expect(result.current.isSuccess).toBe(false)
  })

  it("should expose mutationResult for mutation methods", async () => {
    vi.spyOn(reactor, "callMethod").mockResolvedValue(true)

    const { result } = renderHook(
      () =>
        useActorMethod({
          reactor,
          functionName: "transfer",
        }),
      { wrapper }
    )

    await result.current.call([{ to: "alice", amount: 100n }])

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // mutationResult should be available for mutation methods
    expect(result.current.mutationResult).toBeDefined()
    expect(result.current.mutationResult?.data).toBe(true)
    expect(result.current.queryResult).toBeUndefined()
  })

  it("should call onError callback for mutations", async () => {
    const error = new Error("Transfer failed")
    vi.spyOn(reactor, "callMethod").mockRejectedValue(error)

    const onError = vi.fn()

    const { result } = renderHook(
      () =>
        useActorMethod({
          reactor,
          functionName: "transfer",
          onError,
        }),
      { wrapper }
    )

    try {
      await result.current.call([{ to: "alice", amount: 100n }])
    } catch {
      // Expected
    }

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(onError).toHaveBeenCalledWith(error)
  })

  it("should invalidate multiple queries on successful mutation", async () => {
    vi.spyOn(reactor, "callMethod").mockResolvedValue(true)
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

    const queryKey1 = ["balance", "alice"]
    const queryKey2 = ["balance", "bob"]

    const { result } = renderHook(
      () =>
        useActorMethod({
          reactor,
          functionName: "transfer",
          invalidateQueries: [queryKey1, queryKey2],
        }),
      { wrapper }
    )

    await result.current.call([{ to: "bob", amount: 50n }])

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKey1 })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKey2 })
    expect(invalidateSpy).toHaveBeenCalledTimes(2)
  })
})

describe("useActorMethod - Error Handling", () => {
  let queryClient: QueryClient
  let clientManager: ClientManager
  let reactor: Reactor<TestActor>

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })

    clientManager = new ClientManager({
      queryClient,
    })

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

  it("should handle query method errors", async () => {
    const error = new Error("Query failed")
    vi.spyOn(reactor, "callMethod").mockRejectedValue(error)

    const onError = vi.fn()

    const { result } = renderHook(
      () =>
        useActorMethod({
          reactor,
          functionName: "greet",
          args: ["world"],
          onError,
        }),
      { wrapper }
    )

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBe(error)
    expect(onError).toHaveBeenCalledWith(error)
  })

  it("should handle mutation method errors", async () => {
    const error = new Error("Transfer failed")
    vi.spyOn(reactor, "callMethod").mockRejectedValue(error)

    const { result } = renderHook(
      () =>
        useActorMethod({
          reactor,
          functionName: "transfer",
        }),
      { wrapper }
    )

    try {
      await result.current.call([{ to: "alice", amount: 100n }])
    } catch {
      // Expected
    }

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBe(error)
  })
})

describe("useActorMethod - Call with Different Args", () => {
  let queryClient: QueryClient
  let clientManager: ClientManager
  let reactor: Reactor<TestActor>

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })

    clientManager = new ClientManager({
      queryClient,
    })

    reactor = new Reactor<TestActor>({
      clientManager,
      canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
      idlFactory,
      name: "test",
    })

    vi.spyOn(reactor, "callMethod").mockImplementation(
      async ({ functionName, args }: any): Promise<any> => {
        if (functionName === "greet") {
          return `Hello, ${args[0]}!`
        }
        if (functionName === "transfer") {
          return true
        }
        return null
      }
    )
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  it("should call query method with different args using call()", async () => {
    const onSuccess = vi.fn()

    const { result } = renderHook(
      () =>
        useActorMethod({
          reactor,
          functionName: "greet",
          args: ["default"],
          onSuccess,
        }),
      { wrapper }
    )

    // Wait for initial fetch
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBe("Hello, default!")

    // Call with different args
    const newResult = await result.current.call(["override"])
    expect(newResult).toBe("Hello, override!")
    expect(onSuccess).toHaveBeenCalledWith("Hello, override!")
  })

  it("should call mutation method with args from call()", async () => {
    const { result } = renderHook(
      () =>
        useActorMethod({
          reactor,
          functionName: "transfer",
        }),
      { wrapper }
    )

    const transferResult = await result.current.call([
      { to: "charlie", amount: 200n },
    ])

    expect(transferResult).toBe(true)
    expect(reactor.callMethod).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "transfer",
        args: [{ to: "charlie", amount: 200n }],
      })
    )
  })
})

describe("useActorMethod - React Query Inherited Options", () => {
  let queryClient: QueryClient
  let clientManager: ClientManager
  let reactor: Reactor<TestActor>

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })

    clientManager = new ClientManager({
      queryClient,
    })

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

  it("should support gcTime option (inherited from QueryObserverOptions)", async () => {
    vi.spyOn(reactor, "callMethod").mockResolvedValue("Hello!")

    const { result, unmount } = renderHook(
      () =>
        useActorMethod({
          reactor,
          functionName: "greet",
          args: ["world"],
          gcTime: 0, // Immediately garbage collect
        }),
      { wrapper }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // Unmount the hook
    unmount()

    // Wait a tick for garbage collection to run
    await new Promise((resolve) => setTimeout(resolve, 50))

    // After unmount with gcTime: 0, the query should be garbage collected
    const queryCache = queryClient.getQueryCache()
    const queries = queryCache.findAll({
      queryKey: reactor.generateQueryKey({
        functionName: "greet",
        args: ["world"],
      }),
    })
    expect(queries.length).toBe(0)
  })

  it("should support retry option (inherited from QueryObserverOptions)", async () => {
    let attempts = 0
    vi.spyOn(reactor, "callMethod").mockImplementation(async () => {
      attempts++
      if (attempts < 3) {
        throw new Error("Temporary error")
      }
      return "Hello!"
    })

    const { result } = renderHook(
      () =>
        useActorMethod({
          reactor,
          functionName: "greet",
          args: ["world"],
          retry: 2, // 2 retries = 3 total attempts (initial + 2 retries)
          retryDelay: 0, // No delay for faster test
        }),
      { wrapper }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true), {
      timeout: 10000,
    })
    expect(attempts).toBe(3)
    expect(result.current.data).toBe("Hello!")
  })

  it("should support custom queryKey option", async () => {
    vi.spyOn(reactor, "callMethod").mockResolvedValue("Hello!")

    const customQueryKey = ["custom", "key", "for", "greet"]

    const { result } = renderHook(
      () =>
        useActorMethod({
          reactor,
          functionName: "greet",
          args: ["world"],
          queryKey: customQueryKey,
        }),
      { wrapper }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // Verify the query is cached under custom key
    const cachedData = queryClient.getQueryData(customQueryKey)
    expect(cachedData).toBe("Hello!")
  })

  it("should support refetchInterval option (inherited from QueryObserverOptions)", async () => {
    let callCount = 0
    vi.spyOn(reactor, "callMethod").mockImplementation(async () => {
      callCount++
      return `Hello ${callCount}!`
    })

    const { result } = renderHook(
      () =>
        useActorMethod({
          reactor,
          functionName: "greet",
          args: ["world"],
          refetchInterval: 50, // 50ms
        }),
      { wrapper }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(callCount).toBeGreaterThanOrEqual(1)

    // Wait for at least one refetch
    await waitFor(() => expect(callCount).toBeGreaterThan(1), { timeout: 500 })
  })

  it("should support networkMode option (inherited from QueryObserverOptions)", async () => {
    vi.spyOn(reactor, "callMethod").mockResolvedValue("Hello!")

    const { result } = renderHook(
      () =>
        useActorMethod({
          reactor,
          functionName: "greet",
          args: ["world"],
          networkMode: "always", // Always fetch regardless of network status
        }),
      { wrapper }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBe("Hello!")
  })
})
