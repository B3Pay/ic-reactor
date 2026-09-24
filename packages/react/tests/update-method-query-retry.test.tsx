import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import React, { Suspense } from "react"
import { QueryClient } from "@tanstack/react-query"
import {
  CertifiedRejectErrorCode,
  HttpFetchErrorCode,
  RejectError,
  ReplicaRejectCode,
  TransportError,
  type ActorMethod,
} from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { ClientManager, Reactor, reactorRetry } from "@ic-reactor/core"
import { useActorQuery } from "../src/hooks/useActorQuery.js"
import { useActorSuspenseQuery } from "../src/hooks/useActorSuspenseQuery.js"
import { useActorInfiniteQuery } from "../src/hooks/useActorInfiniteQuery.js"
import { useActorSuspenseInfiniteQuery } from "../src/hooks/useActorSuspenseInfiniteQuery.js"
import { createActorHooks } from "../src/createActorHooks.js"
import { createQuery, createQueryFactory } from "../src/createQuery.js"
import {
  createSuspenseQuery,
  createSuspenseQueryFactory,
} from "../src/createSuspenseQuery.js"
import {
  createInfiniteQuery,
  createInfiniteQueryFactory,
} from "../src/createInfiniteQuery.js"
import {
  createSuspenseInfiniteQuery,
  createSuspenseInfiniteQueryFactory,
} from "../src/createSuspenseInfiniteQuery.js"
import {
  createTestCanister,
  installFakeReplica,
  type FakeReplica,
} from "../src/testing.js"

/**
 * An update method used through a query hook or factory runs again on the
 * canister every time TanStack Query runs the query function, as a new call
 * under a new request id that the IC cannot tell from a retry. A transport
 * failure after the replica accepted the call, or a SysUnknown rejection, was
 * retried by TanStack's default and by `reactorRetry` alike, so one lost
 * response executed the update twice (#622).
 *
 * With no `retry` of its own, a query of an update method now retries only a
 * SysTransient rejection, which proves the canister never ran the call. A
 * `retry` the query sets still wins, and a query method keeps the
 * QueryClient's `retry`.
 */

interface Counter {
  increment: ActorMethod<[], bigint>
  read: ActorMethod<[], bigint>
}

const counterInterface: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({
    increment: IDL.Func([], [IDL.Nat], []),
    read: IDL.Func([], [IDL.Nat], ["query"]),
  })

const CANISTER_ID = "rdmx6-jaaaa-aaaaa-aaadq-cai"

/** defineReactor's default QueryClient, without the backoff between attempts. */
const defineReactorQueryClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: reactorRetry, retryDelay: 0 } },
  })

/** Renders `useHook` in a Suspense boundary and waits until it settles. */
async function settleSuspense(useHook: () => unknown): Promise<void> {
  let caught: unknown
  class Boundary extends React.Component<
    { children: React.ReactNode },
    { failed: boolean }
  > {
    state = { failed: false }
    static getDerivedStateFromError() {
      return { failed: true }
    }
    componentDidCatch(error: unknown) {
      caught = error
    }
    render() {
      return this.state.failed ? null : this.props.children
    }
  }
  const { result } = renderHook(useHook, {
    wrapper: ({ children }) => (
      <Boundary>
        <Suspense fallback={null}>{children}</Suspense>
      </Boundary>
    ),
  })
  await waitFor(() => {
    expect(caught !== undefined || result.current != null).toBe(true)
  })
}

/** Renders `useHook` and waits until its query has settled. */
async function settle(useHook: () => { status: string }): Promise<void> {
  const { result } = renderHook(useHook)
  await waitFor(() => {
    expect(result.current.status).not.toBe("pending")
  })
}

type Method = "increment" | "read"

/** One way to run a query: a hook, a factory's hook, or an imperative fetch. */
type Run = (
  reactor: Reactor<Counter>,
  functionName: Method,
  retry?: { retry: number }
) => Promise<unknown>

const page = {
  getArgs: () => [] as [],
  initialPageParam: 0,
  getNextPageParam: () => undefined,
}

const settleQuietly = (promise: Promise<unknown>) =>
  promise.then(
    () => undefined,
    () => undefined
  )

const paths: Array<[string, Run]> = [
  [
    "useActorQuery",
    (reactor, functionName, retry) =>
      settle(() => useActorQuery({ reactor, functionName, ...retry })),
  ],
  [
    "a bound useActorQuery",
    (reactor, functionName, retry) => {
      const { useActorQuery: useBound } = createActorHooks(reactor)
      return settle(() => useBound({ functionName, ...retry }))
    },
  ],
  [
    "useActorSuspenseQuery",
    (reactor, functionName, retry) =>
      settleSuspense(() =>
        useActorSuspenseQuery({ reactor, functionName, ...retry })
      ),
  ],
  [
    "useActorInfiniteQuery",
    (reactor, functionName, retry) =>
      settle(() =>
        useActorInfiniteQuery({ reactor, functionName, ...page, ...retry })
      ),
  ],
  [
    "useActorSuspenseInfiniteQuery",
    (reactor, functionName, retry) =>
      settleSuspense(() =>
        useActorSuspenseInfiniteQuery({
          reactor,
          functionName,
          ...page,
          ...retry,
        })
      ),
  ],
  [
    "createQuery().useQuery",
    (reactor, functionName, retry) => {
      const query = createQuery(reactor, { functionName, ...retry })
      return settle(() => query.useQuery())
    },
  ],
  [
    "createQuery().useQuery with the hook's own retry",
    (reactor, functionName, retry) => {
      const query = createQuery(reactor, { functionName })
      return settle(() => query.useQuery(retry))
    },
  ],
  [
    "createQuery().fetch",
    (reactor, functionName, retry) =>
      settleQuietly(createQuery(reactor, { functionName, ...retry }).fetch()),
  ],
  [
    "createQuery().prefetch",
    (reactor, functionName, retry) =>
      createQuery(reactor, { functionName, ...retry }).prefetch(),
  ],
  [
    "createQueryFactory()().fetch",
    (reactor, functionName, retry) =>
      settleQuietly(
        createQueryFactory(reactor, { functionName, ...retry })([]).fetch()
      ),
  ],
  [
    "createSuspenseQuery().useSuspenseQuery",
    (reactor, functionName, retry) => {
      const query = createSuspenseQuery(reactor, { functionName, ...retry })
      return settleSuspense(() => query.useSuspenseQuery())
    },
  ],
  [
    "createSuspenseQuery().useSuspenseQuery with the hook's own retry",
    (reactor, functionName, retry) => {
      const query = createSuspenseQuery(reactor, { functionName })
      return settleSuspense(() => query.useSuspenseQuery(retry))
    },
  ],
  [
    "createSuspenseQuery().fetch",
    (reactor, functionName, retry) =>
      settleQuietly(
        createSuspenseQuery(reactor, { functionName, ...retry }).fetch()
      ),
  ],
  [
    "createSuspenseQuery().prefetch",
    (reactor, functionName, retry) =>
      createSuspenseQuery(reactor, { functionName, ...retry }).prefetch(),
  ],
  [
    "createSuspenseQueryFactory()().useSuspenseQuery",
    (reactor, functionName, retry) => {
      const query = createSuspenseQueryFactory(reactor, {
        functionName,
        ...retry,
      })([])
      return settleSuspense(() => query.useSuspenseQuery())
    },
  ],
  [
    "createInfiniteQuery().useInfiniteQuery",
    (reactor, functionName, retry) => {
      const query = createInfiniteQuery(reactor, {
        functionName,
        ...page,
        ...retry,
      })
      return settle(() => query.useInfiniteQuery())
    },
  ],
  [
    "createInfiniteQuery().useInfiniteQuery with the hook's own retry",
    (reactor, functionName, retry) => {
      const query = createInfiniteQuery(reactor, { functionName, ...page })
      return settle(() => query.useInfiniteQuery(retry))
    },
  ],
  [
    "createInfiniteQuery().fetch",
    (reactor, functionName, retry) =>
      settleQuietly(
        createInfiniteQuery(reactor, {
          functionName,
          ...page,
          ...retry,
        }).fetch()
      ),
  ],
  [
    "createInfiniteQueryFactory()().fetch",
    (reactor, functionName, retry) =>
      settleQuietly(
        createInfiniteQueryFactory(reactor, {
          functionName,
          initialPageParam: 0,
          getNextPageParam: () => undefined,
          ...retry,
        })(() => []).fetch()
      ),
  ],
  [
    "createSuspenseInfiniteQuery().useSuspenseInfiniteQuery",
    (reactor, functionName, retry) => {
      const query = createSuspenseInfiniteQuery(reactor, {
        functionName,
        ...page,
        ...retry,
      })
      return settleSuspense(() => query.useSuspenseInfiniteQuery())
    },
  ],
  [
    "createSuspenseInfiniteQuery().fetch",
    (reactor, functionName, retry) =>
      settleQuietly(
        createSuspenseInfiniteQuery(reactor, {
          functionName,
          ...page,
          ...retry,
        }).fetch()
      ),
  ],
  [
    "createSuspenseInfiniteQueryFactory()().fetch",
    (reactor, functionName, retry) =>
      settleQuietly(
        createSuspenseInfiniteQueryFactory(reactor, {
          functionName,
          initialPageParam: 0,
          getNextPageParam: () => undefined,
          ...retry,
        })(() => []).fetch()
      ),
  ],
  [
    "Reactor.fetchQuery",
    (reactor, functionName, retry) =>
      settleQuietly(reactor.fetchQuery({ functionName }, retry)),
  ],
]

/** The error `agent.call` throws when the connection drops. */
const transportFailure = () =>
  TransportError.fromCode(new HttpFetchErrorCode(new TypeError("fetch failed")))

/** A certified rejection, as the reactor's call processing throws it. */
const rejection = (code: number) =>
  RejectError.fromCode(
    new CertifiedRejectErrorCode(
      new Uint8Array(32) as never,
      code as ReplicaRejectCode,
      "rejected",
      undefined
    )
  )

describe.each(paths)("a method run through %s", (_, run) => {
  let reactor: Reactor<Counter>
  let executeCall: ReturnType<typeof vi.fn>
  let executeQuery: ReturnType<typeof vi.fn>

  const reply = IDL.encode([IDL.Nat], [1n])

  beforeEach(() => {
    // Suspense and error boundaries report a failed render on the console.
    vi.spyOn(console, "error").mockImplementation(() => {})
    reactor = new Reactor<Counter>({
      clientManager: new ClientManager({
        queryClient: defineReactorQueryClient(),
        agentOptions: { host: "https://icp-api.io" },
      }),
      name: "counter",
      canisterId: CANISTER_ID,
      idlFactory: counterInterface,
    })
    // One level under callMethod, so each failure reaches the retry wrapped
    // in a CallError, as it does in production.
    const internals = reactor as unknown as Record<string, unknown>
    executeCall = vi.fn()
    executeQuery = vi.fn()
    internals.executeCall = executeCall
    internals.executeQuery = executeQuery
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("does not send an update again after a transport failure", async () => {
    executeCall
      .mockRejectedValueOnce(transportFailure())
      .mockResolvedValue(reply)

    await run(reactor, "increment")

    expect(executeCall).toHaveBeenCalledTimes(1)
  })

  it("does not send an update again after a SysUnknown rejection", async () => {
    executeCall.mockRejectedValueOnce(rejection(6)).mockResolvedValue(reply)

    await run(reactor, "increment")

    expect(executeCall).toHaveBeenCalledTimes(1)
  })

  it("sends an update again after a SysTransient rejection, which it never ran", async () => {
    executeCall
      .mockRejectedValueOnce(rejection(ReplicaRejectCode.SysTransient))
      .mockResolvedValue(reply)

    await run(reactor, "increment")

    expect(executeCall).toHaveBeenCalledTimes(2)
  })

  it("retries an update as a retry the query sets says", async () => {
    executeCall
      .mockRejectedValueOnce(transportFailure())
      .mockResolvedValue(reply)

    await run(reactor, "increment", { retry: 1 })

    expect(executeCall).toHaveBeenCalledTimes(2)
  })

  it("still retries a query method as the QueryClient says", async () => {
    executeQuery
      .mockRejectedValueOnce(transportFailure())
      .mockResolvedValue(reply)

    await run(reactor, "read")

    expect(executeQuery).toHaveBeenCalledTimes(2)
  })
})

describe("an update method's retry against the QueryClient's defaults", () => {
  let reactor: Reactor<Counter>
  let executeCall: ReturnType<typeof vi.fn>

  const createReactor = (queryClient: QueryClient) => {
    reactor = new Reactor<Counter>({
      clientManager: new ClientManager({
        queryClient,
        agentOptions: { host: "https://icp-api.io" },
      }),
      name: "counter",
      canisterId: CANISTER_ID,
      idlFactory: counterInterface,
    })
    executeCall = vi.fn()
    ;(reactor as unknown as Record<string, unknown>).executeCall = executeCall
  }

  it("retries nothing when the client's default is retry: false", async () => {
    createReactor(
      new QueryClient({
        defaultOptions: { queries: { retry: false, retryDelay: 0 } },
      })
    )
    executeCall
      .mockRejectedValueOnce(rejection(ReplicaRejectCode.SysTransient))
      .mockResolvedValue(IDL.encode([IDL.Nat], [1n]))

    await settle(() => useActorQuery({ reactor, functionName: "increment" }))

    expect(executeCall).toHaveBeenCalledTimes(1)
  })

  it("treats a retry: undefined in the options as unset", async () => {
    // Spread into TanStack's options it would select TanStack's own three
    // retries, of a transport failure too.
    createReactor(defineReactorQueryClient())
    executeCall
      .mockRejectedValueOnce(transportFailure())
      .mockResolvedValue(IDL.encode([IDL.Nat], [1n]))

    await settle(() =>
      useActorQuery({ reactor, functionName: "increment", retry: undefined })
    )

    expect(executeCall).toHaveBeenCalledTimes(1)
  })
})

/**
 * The measurement from #622, on the fake replica, which executes each call it
 * receives and counts it. The response to the first call is lost after the
 * canister ran it, and the agent does not resubmit (`retryTimes: 0`), so every
 * execution is a call TanStack Query made.
 */
describe("a lost response to an update method run through a query", () => {
  const HOST = "http://localhost:4943"
  let replica: FakeReplica
  let executions: number
  let dropNextCallResponse: boolean
  let reactor: Reactor<Counter>

  beforeEach(() => {
    executions = 0
    dropNextCallResponse = true
    replica = installFakeReplica({
      host: HOST,
      canisters: {
        [CANISTER_ID]: createTestCanister<Counter>(counterInterface, {
          increment: () => BigInt(++executions),
        }),
      },
    })
    const replicaFetch = globalThis.fetch
    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit
    ) => {
      const response = await replicaFetch(input, init)
      const url = input instanceof Request ? input.url : String(input)
      if (dropNextCallResponse && url.endsWith("/call")) {
        dropNextCallResponse = false
        throw new TypeError("network connection lost")
      }
      return response
    }) as typeof fetch

    reactor = new Reactor<Counter>({
      clientManager: new ClientManager({
        queryClient: defineReactorQueryClient(),
        agentOptions: { host: HOST, retryTimes: 0 },
      }),
      name: "counter",
      canisterId: CANISTER_ID,
      idlFactory: counterInterface,
    })
  })

  afterEach(() => {
    replica.restore()
  })

  const callsSent = () =>
    replica.requests.filter((request) => request.endpoint === "call").length

  it("executes it once through useActorQuery, and shows the error", async () => {
    const { result } = renderHook(() =>
      useActorQuery({ reactor, functionName: "increment" })
    )
    await waitFor(() => {
      expect(result.current.status).toBe("error")
    })

    expect(executions).toBe(1)
    expect(callsSent()).toBe(1)
  })

  it("executes it once through createQuery().fetch()", async () => {
    await expect(
      createQuery(reactor, { functionName: "increment" }).fetch()
    ).rejects.toThrow()

    expect(executions).toBe(1)
  })

  it("executes it again only when the query sets a retry", async () => {
    // The explicit choice: the retry is a second call, and the canister
    // runs it.
    const { result } = renderHook(() =>
      useActorQuery({ reactor, functionName: "increment", retry: 1 })
    )
    await waitFor(() => {
      expect(result.current.status).toBe("success")
    })

    expect(executions).toBe(2)
    expect(result.current.data).toBe(2n)
  })
})
