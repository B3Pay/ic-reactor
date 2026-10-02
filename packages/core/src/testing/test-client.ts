/**
 * `createTestClient`: a real client over a fake replica, with canisters you
 * write as plain functions of domain values and a sign-in you control.
 *
 * Everything the code under test does goes through the same paths as in
 * production: the client signs each call as the principal that is signed in
 * and sends it through an `HttpAgent`, the fake replica checks the signature
 * and certifies the reply, and the client verifies the certificate. Only the
 * canister is replaced, by the handlers a test gives `mock()`.
 * Nothing global is touched: the fake's `fetch` is handed to the client's
 * agents, never put in `globalThis.fetch`.
 *
 * @module
 */
import {
  principal,
  serviceMethods,
  type Principal,
  type Schema,
  type ServiceMethod,
} from "@candid-core/schema"
import {
  DEFAULT_MAX_DEPTH,
  decodeArgs,
  encodeArgs,
} from "@candid-core/schema/codec"
import type { Identity } from "@icp-sdk/core/agent"
import { createClientWith, type Client } from "../client.js"
import { resolveNetwork, type Network } from "../network.js"
import {
  createFakeReplica,
  type FakeCallContext,
  type FakeCanister,
  type FakeReplicaRequest,
} from "./fake-replica.js"
import {
  createTestAuth,
  type TestAuth,
  type TestAuthOptions,
} from "./test-auth.js"

/**
 * The handlers of a mocked canister, typed from the generated `Actor` of its
 * module: one optional function per method.
 *
 * A handler takes the method's arguments as domain values (`bigint` for a
 * `nat`, checked principal text for a `principal`, `{ tag, value }` for a
 * variant) and then a context, `{ caller }`: the principal that sent the call,
 * as checked principal text, after the fake replica verified its signature. It
 * returns what the method returns, or a promise of it. A handler that returns
 * a `number` for a `nat` does not compile.
 *
 * Handlers speak the canister's shapes, not the client's. For a method whose
 * one result is an `Ok`/`Err` variant a handler returns `{ tag: "Ok", value }`
 * or `{ tag: "Err", value }`, and the client unwraps it: the call resolves with
 * the `Ok` payload, or rejects `canister_err` with the `Err` one. For a method
 * with several results a handler returns the tuple, and for one with none it
 * returns nothing.
 *
 * @example
 * ```ts
 * import { actor, type Actor } from "./canisters/icrc1"
 *
 * const handlers: TestHandlers<Actor> = {
 *   icrc1_fee: () => 10_000n,
 *   icrc1_balance_of: ({ owner }, { caller }) => (owner === caller ? 5n : 0n),
 * }
 * ```
 */
export type TestHandlers<A> = {
  [K in keyof A]?: A[K] extends (...args: infer P) => Promise<infer R>
    ? (...args: [...P, ctx: { readonly caller: Principal }]) => R | Promise<R>
    : never
}

const OPTION_NAMES = [
  "identity",
  "signedIn",
  "network",
  "allowEnvConfig",
  "maxDepth",
] as const

/** The first issue of a codec failure, and how many there were, for a message. */
const firstIssue = (
  issues: readonly { readonly path: string; readonly message: string }[]
): string => {
  const [first] = issues
  return first === undefined
    ? "no reason given"
    : `${first.path}: ${first.message}${issues.length > 1 ? ` (and ${issues.length - 1} more)` : ""}`
}

/**
 * The values a handler's return stands for, as the method's result list: the
 * reverse of the collapse a call applies to a reply (no result: `undefined`,
 * one: the value, several: the tuple).
 */
function resultValues(
  method: ServiceMethod,
  reply: unknown
): readonly unknown[] {
  const count = method.results.length
  if (count === 0) return []
  if (count === 1) return [reply]
  if (!Array.isArray(reply) || reply.length !== count) {
    throw new Error(
      `${method.name} has ${count} results, so its handler returns a tuple of ${count} values`
    )
  }
  return reply
}

type Handler = (...args: unknown[]) => unknown

/** The fake canister that answers with `handlers`, for the methods of `service`. */
function mockCanister(
  service: Schema<Principal>,
  handlers: unknown,
  maxDepth: number
): FakeCanister {
  if (typeof handlers !== "object" || handlers === null) {
    throw new TypeError(
      "[ic-reactor] mock() takes the handlers as an object: { method: (...args, { caller }) => reply }."
    )
  }
  let methods: ReadonlyMap<string, ServiceMethod>
  try {
    methods = serviceMethods(service)
  } catch (cause) {
    throw new TypeError(
      `[ic-reactor] mock() takes the service schema of a generated module (its \`actor\` export): ${
        cause instanceof Error ? cause.message : String(cause)
      }.`
    )
  }
  const table = new Map<string, Handler>()
  for (const [name, handler] of Object.entries(handlers)) {
    if (!methods.has(name)) {
      throw new TypeError(
        `[ic-reactor] mock() was given a handler for ${name}, which the service does not have. Its methods: ${[
          ...methods.keys(),
        ].join(", ")}.`
      )
    }
    if (typeof handler !== "function") {
      throw new TypeError(
        `[ic-reactor] the handler for ${name} is a function (...args, { caller }) => reply, got ${typeof handler}.`
      )
    }
    table.set(name, handler as Handler)
  }

  const run =
    (path: "query" | "update") =>
    async (
      name: string,
      arg: Uint8Array,
      { caller }: FakeCallContext
    ): Promise<Uint8Array> => {
      const method = methods.get(name)
      if (method === undefined) {
        throw new Error(`the mocked service has no method ${name}`)
      }
      if (
        path === "query" &&
        method.mode !== "query" &&
        method.mode !== "composite_query"
      ) {
        throw new Error(
          `${name} is an ${method.mode} method: it cannot be called as a query`
        )
      }
      const handler = table.get(name)
      if (handler === undefined) {
        throw new Error(
          `the test gave no handler for ${name}; add it to the handlers of mock()`
        )
      }
      const decoded = decodeArgs(method.args, arg, { maxDepth })
      if (!decoded.ok) {
        throw new Error(
          `the arguments of ${name} do not decode with the mocked service: ${firstIssue(decoded.issues)}`
        )
      }
      const reply = await handler(...decoded.values, {
        caller: principal(caller),
      })
      const encoded = encodeArgs(method.results, resultValues(method, reply), {
        maxDepth,
      })
      if (!encoded.ok) {
        throw new Error(
          `the handler for ${name} returned a value that is not its result: ${firstIssue(encoded.issues)}`
        )
      }
      return encoded.bytes
    }

  return { query: run("query"), update: run("update") }
}

/**
 * Creates a client for a test: a real one, over a fake replica, signed in as
 * a principal the test picks and can change.
 *
 * ```ts
 * const { client, auth, mock } = createTestClient()
 * mock<Actor>(actor, LEDGER, {
 *   icrc1_balance_of: ({ owner }) => (owner === auth.getPrincipal()?.toText() ? 7n : 0n),
 * })
 * const ledger = client.canister<Actor>(actor, { id: LEDGER })
 * await ledger.icrc1_balance_of({ owner: me, subaccount: null }) // 7n
 * ```
 *
 * It runs the same code as production, so a test sees what an app would: a
 * call is signed by the principal signed in when it is made, an update by
 * nobody is refused before it is sent, a reply that is lost is
 * `outcome_unknown`. Each call is also checked as a replica checks it: a
 * canister's `ctx.caller` is the principal the fake verified, never a guess.
 *
 * The fake replica signs with `@noble/curves`, an optional peer dependency of
 * `@ic-reactor/core` that `@icp-sdk/core` already installs. Add it to your
 * devDependencies if your package manager does not let this package resolve
 * it. Nothing global is replaced, `globalThis.fetch` included, so two test
 * clients run side by side, each with its own fake replica and sign-in.
 *
 * @param options - Who is signed in, and optionally which network the client
 * believes it is on. Alone, it signs in as the identity of seed `1`.
 * @returns The client, its sign-in, the means to mock canisters and to fail a
 * call on purpose, and the log of the requests the fake received.
 * @throws TypeError for an option that does not exist, or one that cannot be
 * used.
 *
 * @example
 * ```ts
 * import { createTestClient } from "@ic-reactor/core/testing"
 * import { actor, type Actor } from "./canisters/icrc1"
 *
 * const { client, auth, mock, reject } = createTestClient({ identity: 1 })
 * mock<Actor>(actor, LEDGER, {
 *   icrc1_transfer: (_arg, { caller }) =>
 *     caller === BROKE ? reject(4, "no funds") : { tag: "Ok", value: 1n },
 * })
 * const ledger = client.canister<Actor>(actor, { id: LEDGER })
 *
 * await ledger.icrc1_transfer(arg) // 1n, as the identity of seed 1
 * auth.switchTo(2) // the next call is signed by another principal
 * ```
 */
export function createTestClient(
  options: {
    /**
     * Who is signed in at first: an identity, which must be a real signing
     * identity such as `Ed25519KeyIdentity`, or a number that stands for one
     * (the same number is the same principal in every run, on every machine).
     *
     * @defaultValue The identity of seed `1`.
     */
    identity?: Identity | number
    /**
     * Whether the client starts signed in. When `false` it starts signed out,
     * calls as the anonymous principal (every update is refused), and
     * `auth.signIn()` signs in as `identity`.
     *
     * @defaultValue true
     */
    signedIn?: boolean
    /**
     * Which network the client believes it is on, for the parts a test can see:
     * the network segment of its query keys and the host it connects to. The
     * fake replica answers on that host. The root key is always the fake's own:
     * a `rootKey` or `fetchRootKey` in a network object is ignored, and `"ic"`
     * does not check certificates against mainnet's key, which the fake cannot
     * sign with. Give the host with a scheme.
     *
     * @defaultValue A replica on the fake's own host.
     */
    network?: Network
    /**
     * Whether the `ic_env` cookie is believed, as for `createClient`. It
     * matters only to a test that resolves `{ name }` canisters from a cookie
     * it set up, and a `{ name }` canister resolves only on a page (in jsdom
     * or happy-dom), never in Node, which is where a test client runs by
     * default: a Node test names its canisters with `{ id }`. The root key is
     * never taken from the cookie: it is the fake's own.
     */
    allowEnvConfig?: boolean
    /** How deep a decoded value may nest, for the client and for the mocks. Defaults to 256. */
    maxDepth?: number
  } = {}
): {
  /**
   * A real client (`createClient`'s) whose agents send through the fake
   * replica, and whose auth is `auth`. Unlike a client made
   * by `createClient`, its auth is built in every environment, a server one
   * such as Node included, so signing in and out works in any test runner.
   * Dispose it at the end of the test, as any client.
   */
  readonly client: Client
  /**
   * The sign-in the client calls as: `signIn`, `signOut`, `switchTo` another
   * identity or seed, `expire` the session, or make it `elsewhere`. The status
   * changes at once, and the client's next call is signed by whoever is
   * signed in then. The client owns it and disposes it with itself.
   */
  readonly auth: TestAuth
  /**
   * Runs a canister at `id`, answering with `handlers`, replacing any canister
   * already there. `id` is a canister id, or `aaaaa-aa` for the management
   * canister.
   *
   * `service` is the `actor` export of the generated module and `A` its
   * `Actor` type, as for `client.canister<A>(service, { id })`: write
   * `mock<Actor>(actor, id, handlers)`. Methods answer by their mode: a
   * `query` method on the query path, an `update` on the call path (a `query`
   * method also answers a replicated call, as it does on a canister, which is
   * how a `certified` canister reads it). A call to a method with no handler
   * traps, with a message that names the method.
   *
   * What goes wrong in a handler goes wrong as it does in a canister: a
   * handler that calls `reject()` rejects the call with that
   * reject code, and one that throws anything else traps it (reject code 5,
   * with the error's message). So does a call whose arguments do not decode
   * with `service`, and a handler that returns something the method's result
   * does not encode.
   *
   * @throws TypeError for a `service` that is not a service schema, an `id`
   * that is not a canister id, a handler that is not a function, and a handler
   * for a method the service does not have.
   */
  mock<A>(
    service: Schema<Principal>,
    id: string,
    handlers: TestHandlers<A>
  ): void
  /**
   * Rejects the call being handled with `code`, as a canister does: call it
   * from inside a handler. The reject codes are the interface specification's:
   * `1` SYS_FATAL, `2` SYS_TRANSIENT, `3` DESTINATION_INVALID, `4`
   * CANISTER_REJECT, `5` CANISTER_ERROR and `6` SYS_UNKNOWN. An update is
   * rejected in a certificate and a query in the signed query response.
   *
   * @param code - The reject code the client receives.
   * @param message - The reject message; a default naming the code is used
   * when it is left out.
   */
  reject(code: 1 | 2 | 3 | 4 | 5 | 6, message?: string): never
  /**
   * Loses the reply to the next update call: the canister runs, but the client
   * sees a network failure instead of the answer, so the call ends as
   * `outcome_unknown` with `mayHaveExecuted: true`. The same request is never
   * run twice: the fake keeps its reply lost whenever it is asked again.
   */
  dropNextReply(): void
  /**
   * Answers the next `times` canister requests (a query or a call) with an
   * HTTP error `status` before any canister sees them, as a gateway that
   * throttles does: `refuseNext(429)` is what a client is told when it is
   * rate limited.
   *
   * @param status - An HTTP error status, from 400 to 599.
   * @param times - How many requests to refuse.
   * @defaultValue 1
   */
  refuseNext(status: number, times?: number): void
  /**
   * Every request the client sent the fake replica, in order, as the fake saw
   * it. The same array grows; copy it to keep a moment of it.
   *
   * An entry has an `endpoint` (`"status"`, `"query"`, `"call"` or
   * `"read_state"`) and, where they apply:
   *
   * - `canisterId`: the canister the request was addressed to, as text.
   * - `effectiveCanisterId`: the canister it was routed by. It differs from
   *   `canisterId` for a call to the management canister (`aaaaa-aa`), where
   *   the client takes it from the call's arguments.
   * - `methodName`: the method a `query` or `call` named.
   * - `caller`: the principal the request came from, as text, after the fake
   *   checked its signature. A canister's `ctx.caller` is this.
   * - `refused`: why the fake answered before any canister saw the request: a
   *   signature, delegation or target that did not check out, as a replica
   *   refuses it, or a `refuseNext()` status.
   * - `dropped`: `true` when `dropNextReply()` lost the reply to it.
   */
  readonly requests: readonly FakeReplicaRequest[]
} {
  if (typeof options !== "object" || options === null) {
    throw new TypeError(
      "[ic-reactor] createTestClient() takes an options object, or none."
    )
  }
  const unknown = Object.keys(options).filter(
    (key) => !(OPTION_NAMES as readonly string[]).includes(key)
  )
  if (unknown.length > 0) {
    throw new TypeError(
      `[ic-reactor] createTestClient() has no option ${unknown.join(", ")}. Its options: ${OPTION_NAMES.join(", ")}.`
    )
  }
  const { identity, signedIn, network, allowEnvConfig, maxDepth } = options

  const authOptions: TestAuthOptions =
    typeof identity === "object"
      ? { identity, signedIn }
      : { seed: identity, signedIn }
  const auth = createTestAuth(authOptions)

  // The fake answers on the host the client connects to. A network the test
  // names decides the host (and the key segment); the fake's own origin
  // stands in when it names none.
  const named =
    network === undefined
      ? undefined
      : resolveNetwork(network, { allowEnvConfig })
  const replica = createFakeReplica(
    named === undefined ? {} : { host: named.host }
  )

  const client = createClientWith(
    {
      // The fake signs with its own key, which is the one to verify with
      // whatever network the test says it is on.
      network: {
        host: replica.host,
        rootKey: replica.rootKey,
        ...(named === undefined ? {} : { name: named.keySegment }),
      },
      fetch: replica.fetch,
      auth: () => auth,
      allowEnvConfig,
      maxDepth,
    },
    { authOnServer: true }
  )
  const limit = maxDepth ?? DEFAULT_MAX_DEPTH

  return Object.freeze({
    client,
    auth,
    mock<A>(service: Schema<Principal>, id: string, handlers: TestHandlers<A>) {
      const canister = mockCanister(service, handlers, limit)
      try {
        replica.addCanister(id, canister)
      } catch {
        throw new TypeError(
          `[ic-reactor] mock() takes a canister id, such as "ryjl3-tyaaa-aaaaa-aaaba-cai" or "aaaaa-aa", got ${JSON.stringify(id)}.`
        )
      }
    },
    reject: replica.reject,
    dropNextReply: replica.dropNextReply,
    refuseNext: replica.refuseNext,
    get requests() {
      return replica.requests
    },
  })
}
