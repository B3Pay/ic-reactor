/**
 * The hidden tests' world: ONE signing fake replica (from
 * `@ic-reactor/core/testing`) per test file, installed when this module is
 * first imported — before the solution is — and a `fetch` in front of it that
 * stays in `globalThis.fetch` for the whole file. An `HttpAgent` keeps the
 * `fetch` and root key it found when it was built, so an agent a solution
 * builds at module scope must keep working across tests: the replica, its
 * root key, the host and the ledger id never change within a file, and every
 * test gets a fresh ledger and request log behind that stable front door
 * (`createWorld()`).
 *
 * The front `fetch`
 * - logs every IC request with its origin, request id and the sender the
 *   envelope names (the fake replica has checked the signature, so the sender
 *   is who really signed it), status (root key) requests included;
 * - deduplicates a re-sent envelope as a replica does: the agent re-sends the
 *   *same* signed request (same request id) after a network failure, and a
 *   replica never executes one request id twice. A new call with a new request
 *   id is a new execution, which is what the "not re-sent" tests count;
 * - injects the faults the fake replica cannot express: the call executed and
 *   every reply for that request id was lost; and an HTTP refusal (e.g. 429)
 *   of every call before it reaches the replica;
 * - answers the IC API on `REMOTE_HOST` (a non-local network) with a network
 *   error after logging it, so a test can see whether a solution tried to
 *   fetch a root key from a network that is not local.
 */
import { installFakeReplica, type FakeCanister } from "@ic-reactor/core/testing"
import { Cbor, requestIdOf } from "@icp-sdk/core/agent"
import { Principal } from "@icp-sdk/core/principal"
import { createFakeLedger, type FakeLedger } from "./fake-ledger"

export const LEDGER_ID = "ryjl3-tyaaa-aaaaa-aaaba-cai"
export const HOST = "http://127.0.0.1:4943"
/** A network that is not local (and not mainnet): nothing answers there. */
export const REMOTE_HOST = "https://icp.example.org"
export const ANONYMOUS = "2vxsx-fae"
export const NAT64_MAX = 18_446_744_073_709_551_615n

export interface IcRequest {
  readonly endpoint: "status" | "query" | "call" | "read_state"
  readonly origin: string
  readonly method?: string
  readonly sender?: string
  readonly requestId?: string
  /** `Date.now()` when the request was sent. */
  readonly at: number
  /** The call executed but its reply was dropped by the fault injector. */
  readonly replyLost?: boolean
  /** Same request id as an earlier call: answered from the replica's memory. */
  readonly duplicate?: boolean
  /** Refused with this HTTP status before reaching the replica. */
  readonly refused?: number
}

export interface World {
  readonly host: string
  readonly rootKey: Uint8Array
  readonly ledgerId: string
  readonly ledger: FakeLedger
  readonly requests: readonly IcRequest[]
  /** Calls (update endpoint) to `method`, duplicates of one request id folded. */
  distinctCalls(method?: string): IcRequest[]
  /** Every call, duplicates included. */
  calls(method?: string): IcRequest[]
  queries(method?: string): IcRequest[]
  /** Root key (status endpoint) requests, to any origin. */
  statusRequests(): IcRequest[]
  /** Drop the reply of the n-th (1-based) distinct call to `method`. */
  loseReplyOf(method: string, nth?: number): void
  /** Refuse every call to `method` with this HTTP status before the replica sees it. */
  refuseCallsWith(method: string, status: number): void
  /**
   * Mark principals as this test's: only their requests are logged and run
   * against this test's ledger (anonymous requests always are).
   */
  own(...principals: string[]): void
  /** Kept for symmetry with earlier harness versions: faults are per world. */
  restore(): void
}

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")

const IC_PATH =
  /^\/api\/v\d+\/canister\/[^/]+\/(query|call|read_state)$|^\/api\/v2\/(status)$/

interface Envelope {
  content: {
    sender?: Uint8Array
    method_name?: string
  } & Record<string, unknown>
}

interface State {
  ledger: FakeLedger
  /** Principals the current test created: only their requests are its own. */
  owned: Set<string>
  requests: IcRequest[]
  lost: Set<string>
  answered: Map<
    string,
    { status: number; headers: [string, string][]; body: Uint8Array }
  >
  loseRules: Array<{ method: string; nth: number }>
  refuseRules: Map<string, number>
  distinctCount: Map<string, number>
}

const freshState = (): State => ({
  ledger: createFakeLedger(),
  owned: new Set([ANONYMOUS]),
  requests: [],
  lost: new Set(),
  answered: new Map(),
  loseRules: [],
  refuseRules: new Map(),
  distinctCount: new Map(),
})

let state = freshState()

// The replica runs whichever ledger the current test created. A call from a
// principal the current test does not own is an earlier test's agent still
// retrying in the background: it runs against a throwaway ledger, so it can
// neither change nor be counted in this test's state.
const quarantine = createFakeLedger()
const ledgerFor = (caller: Principal) =>
  state.owned.has(caller.toText()) ? state.ledger : quarantine
const ledgerFront: FakeCanister = {
  query: (method, arg, context) =>
    ledgerFor(context.caller).canister.query!(method, arg, context),
  update: (method, arg, context) =>
    ledgerFor(context.caller).canister.update!(method, arg, context),
}

const original = globalThis.fetch
const replica = installFakeReplica({
  host: HOST,
  canisters: { [LEDGER_ID]: ledgerFront },
})
const fake = globalThis.fetch

const front = async (
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> => {
  const url = new URL(input instanceof Request ? input.url : String(input))
  const match = IC_PATH.exec(url.pathname)
  if (!match) return original(input, init)
  const at = Date.now()
  const { requests } = state
  if (url.origin !== new URL(HOST).origin) {
    requests.push({
      endpoint: (match[1] ?? match[2]) as IcRequest["endpoint"],
      origin: url.origin,
      at,
    })
    throw new TypeError(
      `fetch failed: ${url.origin} is unreachable (test world)`
    )
  }
  if (match[2]) {
    requests.push({ endpoint: "status", origin: url.origin, at })
    return fake(input, init)
  }
  const endpoint = match[1] as "query" | "call" | "read_state"
  const raw = new Uint8Array(
    await new Response(
      input instanceof Request ? input.body : (init?.body as BodyInit)
    ).arrayBuffer()
  )
  const envelope = Cbor.decode(raw) as Envelope
  const content = envelope.content
  const requestId = hex(requestIdOf(content))
  const sender = content.sender
    ? Principal.fromUint8Array(content.sender).toText()
    : undefined
  const method = content.method_name
  const base = { endpoint, origin: url.origin, method, sender, requestId, at }
  // Forward a fresh copy of the body: it was consumed above.
  const forward = () =>
    fake(url, { ...init, method: "POST", body: raw as BodyInit })
  // Not this test's principal: forward it, but keep it out of this test's log
  // and state (an earlier test's agent retrying in the background).
  if (sender !== undefined && !state.owned.has(sender)) return forward()

  if (endpoint !== "call") {
    requests.push(base)
    return forward()
  }

  const refuse = state.refuseRules.get(method ?? "")
  if (refuse !== undefined) {
    requests.push({ ...base, refused: refuse })
    return new Response(`refused by the boundary (injected ${refuse})`, {
      status: refuse,
    })
  }
  if (state.lost.has(requestId)) {
    requests.push({ ...base, duplicate: true, replyLost: true })
    throw new TypeError("fetch failed: connection reset (injected)")
  }
  const seen = state.answered.get(requestId)
  if (seen) {
    requests.push({ ...base, duplicate: true })
    return new Response(seen.body.slice() as BodyInit, {
      status: seen.status,
      headers: seen.headers,
    })
  }

  const n = (state.distinctCount.get(method ?? "") ?? 0) + 1
  state.distinctCount.set(method ?? "", n)
  const lose = state.loseRules.some((r) => r.method === method && r.nth === n)
  const response = await forward()
  const body = new Uint8Array(await response.clone().arrayBuffer())
  if (lose && response.status < 400) {
    state.lost.add(requestId)
    requests.push({ ...base, replyLost: true })
    throw new TypeError("fetch failed: connection reset (injected)")
  }
  if (response.status < 400) {
    state.answered.set(requestId, {
      status: response.status,
      headers: [...response.headers.entries()],
      body,
    })
  }
  requests.push(base)
  return response
}
globalThis.fetch = front as typeof globalThis.fetch

/**
 * A fresh ledger and request log for one test (or one scenario), behind the
 * file's one replica. Earlier worlds' handles read the current state.
 */
export function createWorld(): World {
  state = freshState()
  const current = state
  const local = new URL(HOST).origin
  // Calls and queries count the local replica only: an agent pointed at
  // REMOTE_HOST by an earlier test may still be retrying in the background.
  const byMethod = (method?: string) => (r: IcRequest) =>
    r.origin === local && (method === undefined || r.method === method)
  return {
    host: replica.host,
    rootKey: replica.rootKey,
    ledgerId: LEDGER_ID,
    ledger: current.ledger,
    requests: current.requests,
    calls: (method) =>
      current.requests
        .filter((r) => r.endpoint === "call")
        .filter(byMethod(method)),
    distinctCalls: (method) =>
      current.requests
        .filter((r) => r.endpoint === "call" && !r.duplicate && !r.refused)
        .filter(byMethod(method)),
    queries: (method) =>
      current.requests
        .filter((r) => r.endpoint === "query")
        .filter(byMethod(method)),
    statusRequests: () =>
      current.requests.filter((r) => r.endpoint === "status"),
    loseReplyOf(method, nth = 1) {
      current.loseRules.push({ method, nth })
    },
    refuseCallsWith(method, status) {
      current.refuseRules.set(method, status)
    },
    own(...principals) {
      for (const p of principals) current.owned.add(p)
    },
    restore() {
      current.loseRules.length = 0
      current.refuseRules.clear()
      current.ledger.rejectTransfersWith = null
    },
  }
}

/** Base units → the task's display format: exactly 8 fraction digits. */
export function formatE8s(value: bigint): string {
  const whole = value / 100_000_000n
  const frac = (value % 100_000_000n).toString().padStart(8, "0")
  return `${whole}.${frac}`
}

export const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))
