import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { QueryClient, type QueryObserverOptions } from "@tanstack/query-core"
import {
  CertifiedRejectErrorCode,
  HttpErrorCode,
  HttpFetchErrorCode,
  ProtocolError,
  RejectError,
  ReplicaRejectCode,
  TransportError,
} from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { ClientManager } from "../src/client.js"
import { Reactor } from "../src/reactor.js"
import {
  CallError,
  CanisterError,
  ValidationError,
  isRetryableUpdateError,
  reactorRetry,
  reactorUpdateRetry,
} from "../src/errors/index.js"

/**
 * An update method used through a query runs again on the canister every time
 * the query function does, as a new call under a new request id that the IC
 * cannot tell from a retry. TanStack's default retry and `reactorRetry` both
 * retried a transport failure and a SysUnknown rejection, which can come after
 * the canister ran the call, so one lost response executed the update twice
 * (#622). With no `retry` of its own, such a query now retries only a
 * SysTransient rejection, which proves the call never ran.
 */

const CANISTER_ID = "ryjl3-tyaaa-aaaaa-aaaba-cai"

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({
    increment: IDL.Func([], [IDL.Nat], []),
    read: IDL.Func([], [IDL.Nat], ["query"]),
    read_composite: IDL.Func([], [IDL.Nat], ["composite_query"]),
  })

interface Counter {
  increment: () => Promise<bigint>
  read: () => Promise<bigint>
  read_composite: () => Promise<bigint>
}

const REQUEST_ID = new Uint8Array(32) as never

/** The error `agent.call` throws when the connection drops. */
const transportFailure = () =>
  TransportError.fromCode(new HttpFetchErrorCode(new TypeError("fetch failed")))

/** A certified rejection of the call, as `processUpdateCallResponse` throws. */
const rejection = (code: number) =>
  RejectError.fromCode(
    new CertifiedRejectErrorCode(
      REQUEST_ID,
      code as ReplicaRejectCode,
      "rejected",
      undefined
    )
  )

const wrapped = (cause: unknown) =>
  new CallError('Failed to call method "increment": failed', cause)

describe("isRetryableUpdateError", () => {
  it("accepts a SysTransient rejection, which proves the call never ran", () => {
    expect(
      isRetryableUpdateError(wrapped(rejection(ReplicaRejectCode.SysTransient)))
    ).toBe(true)
    // A differently shaped cause, with the code at the top level.
    expect(
      isRetryableUpdateError(
        new CallError("busy", { kind: "Reject", rejectCode: 2 })
      )
    ).toBe(true)
  })

  it.each([
    ["a transport failure", transportFailure()],
    ["a SysUnknown rejection", rejection(6)],
    ["a CanisterError rejection", rejection(ReplicaRejectCode.CanisterError)],
    [
      "an HTTP 503",
      ProtocolError.fromCode(new HttpErrorCode(503, "", [], undefined)),
    ],
    [
      "an HTTP 429",
      ProtocolError.fromCode(new HttpErrorCode(429, "", [], undefined)),
    ],
    ["a certificate failure", { name: "TrustError", kind: "Trust" }],
  ])("refuses %s, after which the call may have run", (_, cause) => {
    expect(isRetryableUpdateError(wrapped(cause))).toBe(false)
  })

  it("refuses what no retry can change", () => {
    expect(isRetryableUpdateError(new CanisterError({ Err: null }))).toBe(false)
    expect(isRetryableUpdateError(new ValidationError("increment", []))).toBe(
      false
    )
    expect(isRetryableUpdateError(new TypeError("boom"))).toBe(false)
  })
})

describe("reactorUpdateRetry", () => {
  const transient = wrapped(rejection(ReplicaRejectCode.SysTransient))

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("retries a SysTransient rejection up to three times in a browser", () => {
    vi.stubGlobal("window", {})
    expect(reactorUpdateRetry(0, transient)).toBe(true)
    expect(reactorUpdateRetry(2, transient)).toBe(true)
    expect(reactorUpdateRetry(3, transient)).toBe(false)
    expect(reactorUpdateRetry(0, wrapped(transportFailure()))).toBe(false)
  })

  it("does not retry on the server", () => {
    expect(typeof window).toBe("undefined")
    expect(reactorUpdateRetry(0, transient)).toBe(false)
  })
})

describe("Reactor.getQueryRetry", () => {
  let queryClient: QueryClient
  let reactor: Reactor<Counter>

  const transient = wrapped(rejection(ReplicaRejectCode.SysTransient))
  const unknown = wrapped(rejection(6))
  const dropped = wrapped(transportFailure())

  beforeEach(() => {
    vi.stubGlobal("window", {})
    queryClient = new QueryClient()
    reactor = new Reactor<Counter>({
      clientManager: new ClientManager({
        queryClient,
        agentOptions: { host: "https://icp-api.io" },
      }),
      name: "counter",
      canisterId: CANISTER_ID,
      idlFactory,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const retryOf = (functionName: keyof Counter) =>
    reactor.getQueryRetry(
      functionName,
      reactor.generateQueryKey({ functionName })
    )

  it("leaves a query method to the QueryClient", () => {
    expect(retryOf("read")).toBeUndefined()
    expect(retryOf("read_composite")).toBeUndefined()
  })

  it("retries an update method's SysTransient rejection only", () => {
    const retry = retryOf("increment")!
    expect(retry(0, transient)).toBe(true)
    expect(retry(0, unknown)).toBe(false)
    expect(retry(0, dropped)).toBe(false)
  })

  it("retries as often as TanStack Query's default when the client sets none", () => {
    const retry = retryOf("increment")!
    expect(retry(2, transient)).toBe(true)
    expect(retry(3, transient)).toBe(false)
  })

  it("is reactorUpdateRetry under reactorRetry, the default of defineReactor", () => {
    queryClient.setDefaultOptions({ queries: { retry: reactorRetry } })
    const retry = retryOf("increment")!
    for (const failureCount of [0, 1, 2, 3, 4]) {
      for (const error of [transient, unknown, dropped]) {
        expect(retry(failureCount, error)).toBe(
          reactorUpdateRetry(failureCount, error)
        )
      }
    }
  })

  // The client's retry comes last: the title's placeholders take the entries
  // in order, and a function or `false` does not print as a count.
  it.each<[string, number, boolean, QueryObserverOptions["retry"]]>([
    ["retry: false", 0, false, false],
    ["retry: 0", 0, false, 0],
    ["retry: 1", 0, true, 1],
    ["retry: 1", 1, false, 1],
    ["retry: true", 7, true, true],
    ["a function", 1, true, (count) => count < 2],
    ["a function", 2, false, (count) => count < 2],
  ])(
    "under the client default %s, after %i failures, retries: %s",
    (_, failureCount, expected, clientRetry) => {
      queryClient.setDefaultOptions({ queries: { retry: clientRetry } })
      expect(retryOf("increment")!(failureCount, transient)).toBe(expected)
    }
  )

  it("reads the defaults set for the query's key first", () => {
    queryClient.setDefaultOptions({ queries: { retry: 3 } })
    queryClient.setQueryDefaults([CANISTER_ID], { retry: false })
    expect(retryOf("increment")!(0, transient)).toBe(false)
  })

  it("does not retry on the server", () => {
    vi.unstubAllGlobals()
    expect(retryOf("increment")!(0, transient)).toBe(false)
  })
})

describe("the reactor's query paths for an update method", () => {
  let queryClient: QueryClient
  let reactor: Reactor<Counter>
  let executeCall: ReturnType<typeof vi.fn>
  let executeQuery: ReturnType<typeof vi.fn>

  const reply = IDL.encode([IDL.Nat], [1n])

  beforeEach(() => {
    vi.stubGlobal("window", {})
    queryClient = new QueryClient({
      // defineReactor's default, without the backoff between attempts.
      defaultOptions: { queries: { retry: reactorRetry, retryDelay: 0 } },
    })
    reactor = new Reactor<Counter>({
      clientManager: new ClientManager({
        queryClient,
        agentOptions: { host: "https://icp-api.io" },
      }),
      name: "counter",
      canisterId: CANISTER_ID,
      idlFactory,
    })
    // One level under callMethod, so the errors reach the retry wrapped as
    // they are in production.
    const internals = reactor as unknown as {
      executeCall: () => Promise<Uint8Array>
      executeQuery: () => Promise<Uint8Array>
    }
    executeCall = vi.fn()
    executeQuery = vi.fn()
    internals.executeCall = executeCall as never
    internals.executeQuery = executeQuery as never
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("puts the method's retry in getQueryOptions for an update method only", () => {
    expect(
      typeof reactor.getQueryOptions({ functionName: "increment" }).retry
    ).toBe("function")
    // Absent, not `undefined`, so the QueryClient's default still applies.
    expect("retry" in reactor.getQueryOptions({ functionName: "read" })).toBe(
      false
    )
  })

  it.each([
    ["a transport failure", transportFailure],
    ["a SysUnknown rejection", () => rejection(6)],
  ])(
    "fetchQuery does not send the update again after %s",
    async (_, failure) => {
      executeCall.mockRejectedValueOnce(failure()).mockResolvedValue(reply)

      await expect(
        reactor.fetchQuery({ functionName: "increment" })
      ).rejects.toBeInstanceOf(CallError)
      expect(executeCall).toHaveBeenCalledTimes(1)
    }
  )

  it("fetchQuery retries a SysTransient rejection", async () => {
    executeCall
      .mockRejectedValueOnce(rejection(ReplicaRejectCode.SysTransient))
      .mockResolvedValue(reply)

    await expect(
      reactor.fetchQuery({ functionName: "increment" })
    ).resolves.toBe(1n)
    expect(executeCall).toHaveBeenCalledTimes(2)
  })

  it("fetchQuery follows a retry the caller sets", async () => {
    executeCall
      .mockRejectedValueOnce(transportFailure())
      .mockResolvedValue(reply)

    await expect(
      reactor.fetchQuery({ functionName: "increment" }, { retry: 1 })
    ).resolves.toBe(1n)
    expect(executeCall).toHaveBeenCalledTimes(2)
  })

  it("queryClient.fetchQuery with getQueryOptions does not send it again", async () => {
    executeCall
      .mockRejectedValueOnce(transportFailure())
      .mockResolvedValue(reply)

    await expect(
      queryClient.fetchQuery(
        reactor.getQueryOptions({ functionName: "increment" })
      )
    ).rejects.toBeInstanceOf(CallError)
    expect(executeCall).toHaveBeenCalledTimes(1)
  })

  it("still retries a query method's transport failure", async () => {
    executeQuery
      .mockRejectedValueOnce(transportFailure())
      .mockResolvedValue(reply)

    await expect(reactor.fetchQuery({ functionName: "read" })).resolves.toBe(1n)
    expect(executeQuery).toHaveBeenCalledTimes(2)
  })
})
