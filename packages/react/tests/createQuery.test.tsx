import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import React, { Suspense } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ActorMethod } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { ClientManager, Reactor } from "@ic-reactor/core"
import { createQuery, createQueryFactory } from "../src/createQuery.js"
import {
  createTestCanister,
  installFakeReplica,
  type FakeReplica,
} from "../src/testing.js"
import { buildChainedSelect } from "../src/utils.js"

// Define Actor Interface
interface User {
  name: string
  age: bigint
}

interface Item {
  id: string
  value: bigint
}

// Actor type with methods
interface TestActor {
  get_user: ActorMethod<[], User>
  get_item: ActorMethod<[string], [] | [Item]>
  list_items: ActorMethod<[], string[]>
}

const idlFactory: IDL.InterfaceFactory = ({ IDL }) => {
  const User = IDL.Record({ name: IDL.Text, age: IDL.Nat })
  const Item = IDL.Record({ id: IDL.Text, value: IDL.Nat })
  return IDL.Service({
    get_user: IDL.Func([], [User], ["query"]),
    get_item: IDL.Func([IDL.Text], [IDL.Opt(Item)], ["query"]),
    list_items: IDL.Func([], [IDL.Vec(IDL.Text)], ["query"]),
  })
}

const CANISTER_ID = "bkyz2-fmaaa-aaaaa-qaaaq-cai"

// Mock data
const mockUser: User = { name: "Alice", age: 30n }
const mockItem: Item = { id: "item-1", value: 100n }
const mockItems = ["item-1", "item-2", "item-3"]

// The canister the queries run against, on a fake replica, so the real
// Reactor encodes, decodes and keys every call.
let replica: FakeReplica

beforeEach(() => {
  replica = installFakeReplica({
    canisters: {
      [CANISTER_ID]: createTestCanister<TestActor>(idlFactory, {
        get_user: () => mockUser,
        get_item: ([id]) => (id === "item-1" ? [mockItem] : []),
        list_items: () => mockItems,
      }),
    },
  })
})

afterEach(() => {
  replica.restore()
})

/** How many times the canister was asked `methodName`. */
const callsTo = (methodName: keyof TestActor) =>
  replica.requests.filter((request) => request.methodName === methodName).length

/** A Reactor on the fake replica that caches in `queryClient`. */
const createTestReactor = (queryClient: QueryClient) =>
  new Reactor<TestActor>({
    clientManager: new ClientManager({
      queryClient,
      agentOptions: { host: replica.host },
    }),
    name: "test-canister",
    canisterId: CANISTER_ID,
    idlFactory,
  })

describe("createQuery", () => {
  let queryClient: QueryClient
  let reactor: Reactor<TestActor>

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })
    reactor = createTestReactor(queryClient)
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={<div>Loading...</div>}>{children}</Suspense>
    </QueryClientProvider>
  )

  describe("basic functionality", () => {
    it("should create a query with required methods", () => {
      const userQuery = createQuery(reactor, {
        functionName: "get_user",
      })

      expect(userQuery).toBeDefined()
      expect(userQuery.fetch).toBeInstanceOf(Function)
      expect(userQuery.useQuery).toBeInstanceOf(Function)
      expect(userQuery.invalidate).toBeInstanceOf(Function)
      expect(userQuery.getQueryKey).toBeInstanceOf(Function)
    })

    it("should return correct query key", () => {
      const userQuery = createQuery(reactor, {
        functionName: "get_user",
      })

      const queryKey = userQuery.getQueryKey()
      expect(queryKey).toEqual([CANISTER_ID, "get_user"])
      expect(queryKey).toEqual(
        reactor.generateQueryKey({ functionName: "get_user" })
      )
    })

    it("should include args in query key when provided", () => {
      const itemQuery = createQuery(reactor, {
        functionName: "get_item",
        args: ["item-1"],
      })

      expect(itemQuery.getQueryKey()).toEqual(
        reactor.generateQueryKey({ functionName: "get_item", args: ["item-1"] })
      )
      expect(itemQuery.getQueryKey()).not.toEqual(
        reactor.generateQueryKey({ functionName: "get_item", args: ["item-2"] })
      )
    })
  })

  describe("fetch function", () => {
    it("should fetch data correctly", async () => {
      const userQuery = createQuery(reactor, {
        functionName: "get_user",
      })

      const result = await userQuery.fetch()
      expect(result).toEqual(mockUser)
    })

    it("should apply select transform when fetching", async () => {
      const userNameQuery = createQuery(reactor, {
        functionName: "get_user",
        select: (user: User) => user.name,
      })

      const result = await userNameQuery.fetch()
      expect(result).toBe("Alice")
    })
  })

  describe("useQuery hook", () => {
    it("should use query hook correctly", async () => {
      const userQuery = createQuery(reactor, {
        functionName: "get_user",
      })

      const { result } = renderHook(() => userQuery.useQuery(), { wrapper })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toEqual(mockUser)
    })

    it("should apply select transform in useQuery", async () => {
      const userNameQuery = createQuery(reactor, {
        functionName: "get_user",
        select: (user: User) => user.name,
      })

      const { result } = renderHook(() => userNameQuery.useQuery(), { wrapper })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toBe("Alice")
    })

    it("should accept additional useQuery options like staleTime", async () => {
      const userQuery = createQuery(reactor, {
        functionName: "get_user",
      })

      const { result } = renderHook(
        () => userQuery.useQuery({ staleTime: 10000 }),
        { wrapper }
      )

      await waitFor(() => {
        expect(result.current.data).toBeDefined()
      })

      expect(result.current.data).toEqual(mockUser)
    })
  })

  describe("staleTime configuration", () => {
    it("should use default staleTime of 5 minutes", async () => {
      const userQuery = createQuery(reactor, {
        functionName: "get_user",
      })

      await userQuery.fetch()
      const { result } = renderHook(() => userQuery.useQuery(), { wrapper })
      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      // Still fresh, so mounting the hook does not ask the canister again.
      expect(result.current.data).toEqual(mockUser)
      expect(callsTo("get_user")).toBe(1)
    })

    it("should respect custom staleTime", () => {
      const userQuery = createQuery(reactor, {
        functionName: "get_user",
        staleTime: 1000,
      })

      // Verify the query factory was created with the correct structure
      expect(userQuery).toBeDefined()
      expect(userQuery.useQuery).toBeInstanceOf(Function)
      expect(userQuery.fetch).toBeInstanceOf(Function)
    })
  })

  describe("with args", () => {
    it("should pass args to the actor method", async () => {
      const itemQuery = createQuery(reactor, {
        functionName: "get_item",
        args: ["item-1"],
      })

      const { result } = renderHook(() => itemQuery.useQuery(), { wrapper })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toEqual([mockItem])
    })
  })
})

describe("createQueryFactory", () => {
  let queryClient: QueryClient
  let reactor: Reactor<TestActor>

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })
    reactor = createTestReactor(queryClient)
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={<div>Loading...</div>}>{children}</Suspense>
    </QueryClientProvider>
  )

  it("should create a factory function that returns QueryResult", () => {
    const getItem = createQueryFactory(reactor, {
      functionName: "get_item",
    })

    expect(getItem).toBeInstanceOf(Function)

    const itemQuery = getItem(["item-1"])
    expect(itemQuery).toBeDefined()
  })

  it("should fetch data with dynamic args", async () => {
    const getItem = createQueryFactory(reactor, {
      functionName: "get_item",
    })

    const itemQuery = getItem(["item-1"])
    const result = await itemQuery.fetch()
    expect(result).toEqual([mockItem])
  })

  it("should apply select transform with dynamic args", async () => {
    const getItem = createQueryFactory(reactor, {
      functionName: "get_item",
      select: (result: any) =>
        Array.isArray(result) && result.length > 0 ? result[0] : null,
    })

    const itemQuery = getItem(["item-1"])
    const result = await itemQuery.fetch()
    expect(result).toEqual(mockItem)
  })

  it("should work with useQuery hook", async () => {
    const getItem = createQueryFactory(reactor, {
      functionName: "get_item",
    })

    const itemQuery = getItem(["item-1"])

    const { result } = renderHook(() => itemQuery.useQuery(), { wrapper })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data).toEqual([mockItem])
  })
})

describe("chained select - CRITICAL TESTS", () => {
  let queryClient: QueryClient
  let reactor: Reactor<TestActor>

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })
    reactor = createTestReactor(queryClient)
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={<div>Loading...</div>}>{children}</Suspense>
    </QueryClientProvider>
  )

  it("should chain: config.select transforms raw data, options.select transforms that result", async () => {
    const configSelectFn = vi.fn((user: User) => ({
      name: user.name,
      age: Number(user.age),
    }))
    const optionsSelectFn = vi.fn((data: { name: string; age: number }) => ({
      displayName: data.name.toUpperCase(),
      isAdult: data.age >= 18,
    }))

    const userQuery = createQuery(reactor, {
      functionName: "get_user",
      select: configSelectFn,
    })

    const { result } = renderHook(
      () =>
        userQuery.useQuery({
          select: optionsSelectFn,
        }),
      { wrapper }
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(configSelectFn).toHaveBeenCalledWith(mockUser)
    expect(optionsSelectFn).toHaveBeenCalledWith({
      name: "Alice",
      age: 30,
    })
    expect(result.current.data).toEqual({
      displayName: "ALICE",
      isAdult: true,
    })
  })
})

// ============================================================================
// prefetch
// ============================================================================

describe("createQuery - prefetch", () => {
  let queryClient: QueryClient
  let reactor: Reactor<TestActor>

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    reactor = createTestReactor(queryClient)
  })

  it("prefetch() warms the cache without throwing", async () => {
    const userQuery = createQuery(reactor, { functionName: "get_user" })
    await expect(userQuery.prefetch()).resolves.toBeUndefined()
  })

  it("prefetch() populates the cache so subsequent useQuery reads are instant", async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    const userQuery = createQuery(reactor, { functionName: "get_user" })

    // Prefetch outside component
    await userQuery.prefetch()

    // Now mount the hook — data should already be in cache
    const { result } = renderHook(() => userQuery.useQuery(), { wrapper })

    // isLoading is false immediately because cache is populated
    expect(result.current.isLoading).toBe(false)
    expect(result.current.data).toEqual(mockUser)
  })
})

// ============================================================================
// setData
// ============================================================================

describe("createQuery - setData", () => {
  let queryClient: QueryClient
  let reactor: Reactor<TestActor>

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    reactor = createTestReactor(queryClient)
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  it("setData() writes raw data into the cache", () => {
    const userQuery = createQuery(reactor, { functionName: "get_user" })
    const optimistic: User = { name: "Bob", age: 25n }

    userQuery.setData(optimistic)

    const cached = userQuery.getCacheData()
    expect(cached).toEqual(optimistic)
  })

  it("setData() with updater function receives previous value", () => {
    const userQuery = createQuery(reactor, { functionName: "get_user" })
    const initial: User = { name: "Alice", age: 30n }

    userQuery.setData(initial)
    userQuery.setData((prev) => ({ ...prev!, name: "Charlie" }))

    const cached = userQuery.getCacheData()
    expect(cached).toEqual({ name: "Charlie", age: 30n })
  })

  it("setData() triggers a re-render with the new data", async () => {
    const userQuery = createQuery(reactor, { functionName: "get_user" })

    const { result } = renderHook(() => userQuery.useQuery(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(mockUser)

    const updated: User = { name: "Dave", age: 99n }
    userQuery.setData(updated)

    await waitFor(() => {
      expect(result.current.data).toEqual(updated)
    })
  })
})

describe("createQuery - select memoization", () => {
  let queryClient: QueryClient
  let reactor: Reactor<TestActor>

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    reactor = createTestReactor(queryClient)
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  it("does not re-run a config select on every render", async () => {
    // Regression: the chained select used to be a fresh closure each render, so
    // QueryObserver's `options.select === previousSelectFn` memo never hit and
    // the select re-ran per render.
    const select = vi.fn((user: User) => user.name)
    const query = createQuery(reactor, {
      functionName: "get_user",
      select,
    })

    const { result, rerender } = renderHook(() => query.useQuery(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const afterLoad = select.mock.calls.length
    for (let i = 0; i < 5; i++) rerender()

    expect(select.mock.calls.length).toBe(afterLoad)
  })

  it("keeps data reference-stable across renders for a non-plain select result", async () => {
    // A Map cannot be structurally shared by replaceEqualDeep, so an unstable
    // select handed the consumer a new reference every render — which turns any
    // useEffect([data]) that sets state into an unbounded loop.
    const query = createQuery(reactor, {
      functionName: "get_user",
      select: (user: User) => new Map([["name", user.name]]),
    })

    const { result, rerender } = renderHook(() => query.useQuery(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const seen = new Set<unknown>()
    for (let i = 0; i < 5; i++) {
      seen.add(result.current.data)
      rerender()
    }

    expect(seen.size).toBe(1)
  })

  it("passes the caller's own function through when only one select is present", () => {
    const configSelect = (user: User) => user.name
    const query = createQuery(reactor, {
      functionName: "get_user",
      select: configSelect,
    })
    // No wrapper is allocated for the single-select case, so a module-scope
    // select stays referentially stable for the observer.
    expect(query).toBeDefined()
    expect(buildChainedSelect(configSelect, undefined)).toBe(configSelect)
    const hookSelect = (name: string) => name
    expect(buildChainedSelect(undefined, hookSelect)).toBe(hookSelect)
    expect(buildChainedSelect(undefined, undefined)).toBeUndefined()
  })
})
