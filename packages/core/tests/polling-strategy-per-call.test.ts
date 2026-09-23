import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { QueryClient } from "@tanstack/query-core"
import {
  AgentError,
  LookupPathStatus,
  RequestStatusResponseStatus,
  TimeoutWaitingForResponseErrorCode,
  defaultStrategy,
} from "@icp-sdk/core/agent"
import type {
  CallConfig,
  PollingOptions,
  PollStrategy,
  RequestId,
} from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { Principal } from "@icp-sdk/core/principal"
import { ClientManager } from "../src/client.js"
import { Reactor } from "../src/reactor.js"
import { CallError } from "../src/errors/index.js"
import { uint8ArrayToHex } from "../src/utils/helper.js"
import { createPollingStrategy } from "../src/utils/polling.js"

const CANISTER_ID = "ryjl3-tyaaa-aaaaa-aaaba-cai"
const TARGET = { canisterId: Principal.fromText(CANISTER_ID) }
const MINUTE = 60_000

/** Every request the agent submits has its own ID; these stand in for them. */
const requestId = (n: number) => new Uint8Array(32).fill(n) as RequestId

/**
 * How long one poll of request `id` sleeps before the agent's next read_state.
 * Under fake timers that sleep is the strategy's only timer, so the clock moves
 * by exactly that much.
 */
async function sleepOf(strategy: PollStrategy, id: RequestId): Promise<number> {
  const before = Date.now()
  const poll = strategy(TARGET, id, RequestStatusResponseStatus.Processing)
  let settled = false
  void poll.then(
    () => (settled = true),
    () => (settled = true)
  )
  for (let i = 0; !settled && i < 5; i++) {
    await vi.advanceTimersToNextTimerAsync()
  }
  await poll
  return Date.now() - before
}

/** Poll request `id` the way the agent does until the strategy throws. */
async function pollUntilItThrows(
  strategy: PollStrategy,
  id: RequestId
): Promise<unknown> {
  for (let i = 0; i < 500; i++) {
    try {
      await sleepOf(strategy, id)
    } catch (error) {
      return error
    }
  }
  throw new Error("the strategy was still polling after 500 polls")
}

const isTimeout = (error: unknown) =>
  error instanceof AgentError &&
  error.hasCode(TimeoutWaitingForResponseErrorCode)

beforeEach(() => {
  vi.useFakeTimers()
  // No jitter, so every delay is exactly its phase's base delay: 100ms while
  // fast, 5s on the plateau.
  vi.spyOn(Math, "random").mockReturnValue(0.5)
  vi.spyOn(console, "info").mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/**
 * A reactor hands one `pollingOptions` object to every update call it makes, so
 * a strategy configured there serves all of them. `createPollingStrategy` kept
 * one attempt counter and one start time for its whole life, so every call
 * after the first few began where the earlier ones had left off: past the fast
 * phase, and on the plateau once 20 seconds had gone by since it was created.
 */
describe("createPollingStrategy shared by several requests", () => {
  it("starts a request that begins 30 seconds after another in the fast phase", async () => {
    const strategy = createPollingStrategy()
    const first = requestId(1)

    for (let i = 0; i < 12; i++) await sleepOf(strategy, first)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(await sleepOf(strategy, first)).toBe(5_000)

    expect(await sleepOf(strategy, requestId(2))).toBe(100)
    expect(console.info).toHaveBeenLastCalledWith(
      expect.stringContaining("attempt=1 elapsed=0ms")
    )
    // ...and the first request carries on where it was.
    expect(await sleepOf(strategy, first)).toBe(5_000)
  })

  it("keeps requests that poll at the same time on separate counters", async () => {
    const strategy = createPollingStrategy()
    const first = requestId(1)
    const second = requestId(2)

    for (let i = 0; i < 9; i++) {
      expect(await sleepOf(strategy, first)).toBe(100)
    }
    expect(await sleepOf(strategy, second)).toBe(100)
    // The first request's tenth poll leaves the fast phase on its own count.
    expect(await sleepOf(strategy, first)).toBeGreaterThan(100)
    expect(await sleepOf(strategy, second)).toBe(100)
  })
})

/**
 * A request the network never took stays `unknown` forever, and without a
 * limit the strategy polled it for as long as the page stayed open.
 */
describe("createPollingStrategy timeout", () => {
  it("gives up on a request after five minutes by default, as the SDK's defaultStrategy() does", async () => {
    const strategy = createPollingStrategy()
    const start = Date.now()

    const error = await pollUntilItThrows(strategy, requestId(1))

    expect(isTimeout(error)).toBe(true)
    // At the first poll past the limit: no earlier, and no later than one
    // plateau delay after it.
    expect(Date.now() - start).toBeGreaterThanOrEqual(5 * MINUTE)
    expect(Date.now() - start).toBeLessThanOrEqual(5 * MINUTE + 5_000)
  })

  it("times each request from its own first poll, not from when the strategy was created", async () => {
    const strategy = createPollingStrategy({ timeoutMs: MINUTE })
    const first = requestId(1)
    const second = requestId(2)

    const start = Date.now()
    while (Date.now() - start < 50_000) await sleepOf(strategy, first)
    await sleepOf(strategy, second)

    expect(isTimeout(await pollUntilItThrows(strategy, first))).toBe(true)
    // The second request is only a few seconds into its own minute.
    await expect(sleepOf(strategy, second)).resolves.toBeGreaterThan(0)
  })

  it("polls a request that starts after six minutes of uptime normally", async () => {
    const strategy = createPollingStrategy()
    await vi.advanceTimersByTimeAsync(6 * MINUTE)

    expect(await sleepOf(strategy, requestId(1))).toBe(100)
  })

  it("keeps polling with no limit when timeoutMs is Infinity", async () => {
    const strategy = createPollingStrategy({ timeoutMs: Infinity })
    const id = requestId(1)

    const start = Date.now()
    while (Date.now() - start < 10 * MINUTE) await sleepOf(strategy, id)

    expect(await sleepOf(strategy, id)).toBe(5_000)
  })
})

/**
 * The agent stops calling the strategy once a request settles and never tells
 * it so. A request that has gone quiet is taken as finished and dropped, which
 * is only visible from outside when the same ID polls again much later.
 */
describe("createPollingStrategy per-request state", () => {
  it("drops a request that has stopped polling", async () => {
    const strategy = createPollingStrategy()
    const id = requestId(1)
    for (let i = 0; i < 12; i++) await sleepOf(strategy, id)

    await vi.advanceTimersByTimeAsync(10 * MINUTE)

    expect(await sleepOf(strategy, id)).toBe(100)
  })

  it("keeps a request whose read_state took two minutes to come back", async () => {
    const strategy = createPollingStrategy()
    const id = requestId(1)
    for (let i = 0; i < 12; i++) await sleepOf(strategy, id)

    await vi.advanceTimersByTimeAsync(2 * MINUTE)

    // Still its thirteenth poll, now on the plateau, not a fresh start.
    expect(await sleepOf(strategy, id)).toBe(5_000)
  })
})

// ── Through a Reactor, the way the core README configures it ──────────────

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({ transfer: IDL.Func([], [IDL.Nat], []) })

const text = (s: string) => new TextEncoder().encode(s)

/** A verified certificate that answers only the request_status leaves given. */
const certificateWith = (entries: Record<string, Uint8Array>) => ({
  lookup_path: (path: Array<Uint8Array | string>) => {
    const last = path[path.length - 1]
    const key = typeof last === "string" ? last : new TextDecoder().decode(last)
    return key in entries
      ? { status: LookupPathStatus.Found, value: entries[key] }
      : { status: LookupPathStatus.Absent }
  },
})

/**
 * A canister that keeps every call processing for `pendingPolls` read_states
 * and then replies 42. Returns the time of each read_state, by request.
 */
function slowCanister(clientManager: ClientManager, pendingPolls: number) {
  const polls = new Map<string, number[]>()
  let submitted = 0

  vi.spyOn(clientManager.agent, "call").mockImplementation(
    async () =>
      ({
        requestId: requestId(++submitted),
        response: {
          ok: true,
          status: 202,
          statusText: "Accepted",
          body: null,
          headers: [],
        },
      }) as never
  )
  vi.spyOn(clientManager.agent, "readState").mockImplementation(
    async (_target, { paths }) => {
      // pollForResponse reads one raw path: ["request_status", requestId].
      const [[, id]] = paths as Uint8Array[][]
      const key = uint8ArrayToHex(id)
      const times = [...(polls.get(key) ?? []), Date.now()]
      polls.set(key, times)
      const status = times.length > pendingPolls ? "replied" : "processing"
      return {
        certificate: new Uint8Array(),
        verifiedCertificate: certificateWith({
          status: text(status),
          reply: IDL.encode([IDL.Nat], [42n]),
        }),
      } as never
    }
  )

  return polls
}

/** Let a call run to completion, firing the timers it waits on. */
async function settle<T>(call: Promise<T>): Promise<T> {
  let settled = false
  void call.then(
    () => (settled = true),
    () => (settled = true)
  )
  for (let i = 0; !settled && i < 1_000; i++) {
    await vi.advanceTimersToNextTimerAsync()
  }
  return call
}

describe("the core README's polling configuration", () => {
  let clientManager: ClientManager

  const reactor = (pollingOptions?: PollingOptions) =>
    new Reactor({
      clientManager,
      name: "ledger",
      canisterId: CANISTER_ID,
      idlFactory,
      pollingOptions,
    })

  const transfer = (backend: Reactor, callConfig?: CallConfig) =>
    settle(
      backend.callMethod({ functionName: "transfer" as never, callConfig })
    )

  beforeEach(() => {
    clientManager = new ClientManager({
      queryClient: new QueryClient(),
      agentOptions: { host: "https://icp-api.io" },
    })
  })

  it("polls each call on its own schedule after the app has been up for six minutes", async () => {
    const polls = slowCanister(clientManager, 12)
    const backend = reactor({ strategy: createPollingStrategy() })
    await vi.advanceTimersByTimeAsync(6 * MINUTE)

    await expect(transfer(backend)).resolves.toBe(42n)
    await expect(transfer(backend)).resolves.toBe(42n)

    // The second call starts fast instead of on the first call's count.
    const [first, second] = [...polls.values()]
    expect(first[1] - first[0]).toBe(100)
    expect(second[1] - second[0]).toBe(100)
  })

  it("gives each call a fresh defaultStrategy() when the reactor sets no strategy", async () => {
    slowCanister(clientManager, 3)
    const backend = reactor()
    await vi.advanceTimersByTimeAsync(6 * MINUTE)

    await expect(transfer(backend)).resolves.toBe(42n)
    await expect(transfer(backend)).resolves.toBe(42n)
  })

  it("accepts a defaultStrategy() created for the call in callConfig", async () => {
    slowCanister(clientManager, 3)
    const backend = reactor()
    await vi.advanceTimersByTimeAsync(6 * MINUTE)

    await expect(
      transfer(backend, { pollingOptions: { strategy: defaultStrategy() } })
    ).resolves.toBe(42n)
  })

  it("fails every call that needs a poll once a shared defaultStrategy() is five minutes old", async () => {
    // What the README used to show. The SDK's strategy starts its five-minute
    // timeout when it is created, and the reactor hands that one instance to
    // every call.
    slowCanister(clientManager, 1)
    const backend = reactor({ strategy: defaultStrategy() })
    await vi.advanceTimersByTimeAsync(6 * MINUTE)

    const call = transfer(backend)
    await expect(call).rejects.toBeInstanceOf(CallError)
    await expect(call).rejects.toThrow("Request timed out after 300000 msec")
  })
})
