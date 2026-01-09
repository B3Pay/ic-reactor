import { describe, it, expect, vi, beforeAll } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import React from "react"
import {
  createActorHooks,
  createQuery,
  createQueryFactory,
  createMutation,
  createInfiniteQuery,
  createInfiniteQueryFactory,
  createSuspenseQuery,
  createSuspenseQueryFactory,
  createSuspenseInfiniteQuery,
  createSuspenseInfiniteQueryFactory,
} from "../src"
import { ClientManager, Reactor, DisplayReactor } from "@ic-reactor/core"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { IDL } from "@icp-sdk/core/candid"
import { Principal } from "@icp-sdk/core/principal"
import { ActorMethod } from "@icp-sdk/core/agent"

// Define the actor type
interface TestActor {
  get_balance: ActorMethod<[{ owner: Principal }], bigint>
  transfer: ActorMethod<
    [{ to: Principal; amount: bigint }],
    { Ok: bigint } | { Err: string }
  >
}

// Define the IDL factory
const idlFactory: IDL.InterfaceFactory = ({ IDL }) => {
  return IDL.Service({
    get_balance: IDL.Func(
      [IDL.Record({ owner: IDL.Principal })],
      [IDL.Nat],
      ["query"]
    ),
    transfer: IDL.Func(
      [IDL.Record({ to: IDL.Principal, amount: IDL.Nat })],
      [IDL.Variant({ Ok: IDL.Nat, Err: IDL.Text })],
      ["update"]
    ),
  })
}

const canisterId = "rrkah-fqaaa-aaaaa-aaaaq-cai"

describe("CandidAdapter & ActorHooks Type Safety", () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
  const clientManager = new ClientManager({ queryClient })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  describe("Standard Reactor", () => {
    const reactor = new Reactor<TestActor>({
      name: "test",
      idlFactory,
      canisterId,
      clientManager,
    })

    const { useActorQuery } = createActorHooks(reactor)

    it("should have correct types for useActorQuery", () => {
      // This test is primarily for TypeScript verification during compilation
      const { result } = renderHook(
        () =>
          useActorQuery({
            functionName: "get_balance",
            args: [{ owner: Principal.fromText("2vxsx-fae") }],
          }),
        { wrapper }
      )

      // EXPECTATION: result.current.data should be bigint | undefined
      // If you hover over 'data' in a real IDE, you'd see 'bigint | undefined'
      const data: bigint | undefined = result.current.data
      expect(data).toBeUndefined()
    })
  })

  describe("DisplayReactor", () => {
    const displayReactor = new DisplayReactor<TestActor>({
      name: "test",
      idlFactory,
      canisterId,
      clientManager,
    })

    const { useActorQuery, useActorMutation } = createActorHooks(displayReactor)

    const getBalanceQueryFactory = createQueryFactory(displayReactor, {
      functionName: "get_balance",
    })

    beforeAll(async () => {
      await clientManager.initializeAgent()
    })

    it("should transform types to display strings in createQueryFactory", async () => {
      // Spy on callMethod to intercept execution and return mock data
      const callMethodSpy = vi.spyOn(displayReactor, "callMethod")
      callMethodSpy.mockResolvedValue("100000000" as any)

      const { result } = renderHook(
        () => getBalanceQueryFactory([{ owner: "2vxsx-fae" }]).useQuery(),
        { wrapper }
      )

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      // Verification: The bigint 100000000n should be stringified
      expect(result.current.data).toBe("100000000")

      // Verification: The incoming argument should have been converted back to Principal
      // callMethod receives the raw arguments (display types)
      const calledArgs = callMethodSpy.mock.calls[0][0].args as any
      expect(calledArgs[0].owner).toBe("2vxsx-fae")
    })

    it("should transform types to display strings in useActorQuery", async () => {
      // Spy on callMethod to intercept execution and return mock data
      const callMethodSpy = vi.spyOn(displayReactor, "callMethod")
      callMethodSpy.mockResolvedValue("100000000" as any)

      const { result } = renderHook(
        () =>
          useActorQuery({
            functionName: "get_balance",
            args: [{ owner: "2vxsx-fae" }],
          }),
        { wrapper }
      )

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      // Verification: The bigint 100000000n should be stringified
      expect(result.current.data).toBe("100000000")

      // Verification: The incoming argument should have been converted back to Principal
      // callMethod receives the raw arguments (display types)
      const calledArgs = callMethodSpy.mock.calls[0][0].args as any
      expect(calledArgs[0].owner).toBe("2vxsx-fae")
    })

    it("should unwrap Result and transform update call types", async () => {
      vi.clearAllMocks()
      // Mock return value as a Result variant (but already processed by generic reactor logic?
      // Actually callMethod returns the FINAL result if we spy on it, so we simulate the display result directly)
      const callMethodSpy = vi.spyOn(displayReactor, "callMethod")
      callMethodSpy.mockResolvedValue("123" as any)

      const { result } = renderHook(
        () =>
          useActorMutation({
            functionName: "transfer",
          }),
        { wrapper }
      )

      // Call mutate with display types (string instead of bigint)
      const data = await result.current.mutateAsync([
        { to: "2vxsx-fae", amount: "500" },
      ])

      // Verification: Response is unwrapped and bigint stringified
      expect(data).toBe("123")

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toBe("123")

      // Verification: Input strings converted to Principal and bigint
      // args are passed as an array [ { to: ..., amount: ... } ]
      // so calledArgs[0] is the object
      const argsArray = callMethodSpy.mock.calls[0][0].args as any
      expect(argsArray[0].to).toBe("2vxsx-fae")
      expect(argsArray[0].amount).toBe("500")
    })

    it("should work with createQuery factory directly", async () => {
      vi.clearAllMocks()
      queryClient.clear()
      const callMethodSpy = vi.spyOn(displayReactor, "callMethod")
      callMethodSpy.mockResolvedValue("100000000" as any)

      const query = createQuery(displayReactor, {
        functionName: "get_balance",
        args: [{ owner: "2vxsx-fae" }],
      })

      const { result } = renderHook(() => query.useQuery(), { wrapper })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(result.current.data).toBe("100000000")
      const calledArgs = callMethodSpy.mock.calls[0][0].args as any
      expect(calledArgs[0].owner).toBe("2vxsx-fae")
    })

    it("should work with createMutation factory directly", async () => {
      vi.clearAllMocks()
      // Mutations usually don't need cache clearing but good practice if checking side effects
      queryClient.clear()
      const callMethodSpy = vi.spyOn(displayReactor, "callMethod")
      // Mock result for transfer
      callMethodSpy.mockResolvedValue("123" as any)

      const mutation = createMutation(displayReactor, {
        functionName: "transfer",
      })

      const { result } = renderHook(() => mutation.useMutation(), { wrapper })

      const data = await result.current.mutateAsync([
        { to: "2vxsx-fae", amount: "500" },
      ])

      expect(data).toBe("123")
      const calledArgs = callMethodSpy.mock.calls[0][0].args as any
      expect(calledArgs[0].to).toBe("2vxsx-fae")
      expect(calledArgs[0].amount).toBe("500")
    })

    it("should work with createInfiniteQuery", async () => {
      vi.clearAllMocks()
      queryClient.clear()
      const callMethodSpy = vi.spyOn(displayReactor, "callMethod")
      callMethodSpy.mockResolvedValue("100000000" as any)

      const infiniteQuery = createInfiniteQuery(displayReactor, {
        functionName: "get_balance",
        initialPageParam: 0,
        // Cast as any to satisfy tuple requirement easily in test
        getArgs: (_page) => [{ owner: "2vxsx-fae" }] as const,
        getNextPageParam: (_lastPage) => null,
      })

      const { result } = renderHook(() => infiniteQuery.useInfiniteQuery(), {
        wrapper,
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(result.current.data?.pages[0]).toBe("100000000")
    })

    it("should work with createInfiniteQueryFactory", async () => {
      vi.clearAllMocks()
      queryClient.clear()
      const callMethodSpy = vi.spyOn(displayReactor, "callMethod")
      callMethodSpy.mockResolvedValue("100000000" as any)

      const infiniteQueryFactory = createInfiniteQueryFactory(displayReactor, {
        functionName: "get_balance",
        initialPageParam: 0,
        getNextPageParam: (_lastPage: unknown) => null,
      })

      const getArgs = (_page: unknown) => [{ owner: "2vxsx-fae" }] as any
      const { result } = renderHook(
        () => infiniteQueryFactory(getArgs).useInfiniteQuery(),
        { wrapper }
      )

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data?.pages[0]).toBe("100000000")
    })

    const suspenseWrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <React.Suspense fallback={<div>Loading...</div>}>
          {children}
        </React.Suspense>
      </QueryClientProvider>
    )

    it("should work with createSuspenseQuery", async () => {
      vi.clearAllMocks()
      queryClient.clear()
      const callMethodSpy = vi.spyOn(displayReactor, "callMethod")
      callMethodSpy.mockResolvedValue("100000000" as any)

      const query = createSuspenseQuery(displayReactor, {
        functionName: "get_balance",
        args: [{ owner: "2vxsx-fae" }],
      })

      const { result } = renderHook(() => query.useSuspenseQuery(), {
        wrapper: suspenseWrapper,
      })

      await waitFor(() => expect(result.current.data).toBe("100000000"))
    })

    it("should work with createSuspenseQueryFactory", async () => {
      vi.clearAllMocks()
      queryClient.clear()
      const callMethodSpy = vi.spyOn(displayReactor, "callMethod")
      callMethodSpy.mockResolvedValue("100000000" as any)

      const queryFactory = createSuspenseQueryFactory(displayReactor, {
        functionName: "get_balance",
      })

      const { result } = renderHook(
        () => queryFactory([{ owner: "2vxsx-fae" }]).useSuspenseQuery(),
        { wrapper: suspenseWrapper }
      )

      await waitFor(() => expect(result.current.data).toBe("100000000"))
    })

    it("should work with createSuspenseInfiniteQuery", async () => {
      vi.clearAllMocks()
      queryClient.clear()
      const callMethodSpy = vi.spyOn(displayReactor, "callMethod")
      callMethodSpy.mockResolvedValue("100000000" as any)

      const infiniteQuery = createSuspenseInfiniteQuery(displayReactor, {
        functionName: "get_balance",
        initialPageParam: 0,
        getArgs: (_page: unknown) => [{ owner: "2vxsx-fae" }] as any,
        getNextPageParam: (_lastPage: unknown) => null,
      })

      const { result } = renderHook(
        () => infiniteQuery.useSuspenseInfiniteQuery(),
        { wrapper: suspenseWrapper }
      )

      await waitFor(() => expect(result.current.data).toBeDefined())
      expect(result.current.data.pages[0]).toBe("100000000")
    })

    it("should work with createSuspenseInfiniteQueryFactory", async () => {
      vi.clearAllMocks()
      queryClient.clear()
      const callMethodSpy = vi.spyOn(displayReactor, "callMethod")
      callMethodSpy.mockResolvedValue("100000000" as any)

      const infiniteQueryFactory = createSuspenseInfiniteQueryFactory(
        displayReactor,
        {
          functionName: "get_balance",
          initialPageParam: 0,
          getNextPageParam: (_lastPage: unknown) => null,
        }
      )

      const { result } = renderHook(
        () =>
          infiniteQueryFactory((_page) => [
            { owner: "2vxsx-fae" },
          ]).useSuspenseInfiniteQuery(),
        { wrapper: suspenseWrapper }
      )

      await waitFor(() => expect(result.current.data).toBeDefined())
      expect(result.current.data.pages[0]).toBe("100000000")
    })
  })
})
