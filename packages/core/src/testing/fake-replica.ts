/**
 * A fake replica, reached through the `fetch` an `HttpAgent` is given.
 *
 * {@link createFakeReplica} returns a `fetch` to pass as
 * `HttpAgentOptions.fetch`, so the agents that use it are the only code that
 * reaches the fake and nothing global is touched. {@link installFakeReplica}
 * puts the same fake in `globalThis.fetch` instead, for code that builds its
 * own agents.
 *
 * It holds its own root key and node key, and signs what a replica signs: a
 * BLS signature over each certificate and a node signature over each query
 * response. The agent verifies both exactly as it would against a replica, so
 * nothing in the agent is mocked, and an agent that checks a certificate
 * against the wrong root key fails here as it would there.
 *
 * Like a replica, it checks who sent each request before any canister sees it,
 * so the caller a canister is told about is the one a replica would report.
 *
 * It implements the endpoints an agent uses for canister calls and nothing
 * else: the status endpoint (the root key), and a canister's `query`, `call`
 * (which always answers synchronously) and `read_state` (the subnet's node
 * keys and canister ranges, which an agent reads before it trusts a query).
 *
 * Three fault hooks reproduce what a real network does to a call: a canister
 * that rejects it with a chosen reject code, a reply that is lost after the
 * canister ran, and an HTTP refusal before any canister sees the call.
 */
import { bls12_381 } from "@noble/curves/bls12-381.js"
import { ed25519 } from "@noble/curves/ed25519.js"
import { p256 } from "@noble/curves/nist.js"
import { secp256k1 } from "@noble/curves/secp256k1.js"
import {
  BLS12_381_G2_OID,
  Cbor,
  IC_REQUEST_AUTH_DELEGATION_DOMAIN_SEPARATOR,
  IC_REQUEST_DOMAIN_SEPARATOR,
  IC_RESPONSE_DOMAIN_SEPARATOR,
  IC_STATE_ROOT_DOMAIN_SEPARATOR,
  NodeType,
  ReplicaRejectCode,
  hashOfMap,
  reconstruct,
  requestIdOf,
  wrapDER,
  type HashTree,
} from "@icp-sdk/core/agent"
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity"
import { Principal } from "@icp-sdk/core/principal"

/**
 * Whether a page on this hostname talks to a replica it serves itself: a
 * local host (`localhost`, its subdomains, all of 127.0.0.0/8, `::1`) or a
 * Codespaces/Gitpod forward. Kept from v3's `getNetworkByHostname` so the
 * fake routes a page's same-origin requests as it always did.
 */
const isNonMainnetPageHost = (hostname: string): boolean =>
  hostname === "localhost" ||
  hostname.endsWith(".localhost") ||
  hostname.endsWith("127.0.0.1") ||
  /^127\.(?:\d{1,3}\.){2}\d{1,3}$/.test(hostname) ||
  hostname === "::1" ||
  hostname === "[::1]" ||
  hostname.endsWith(".github.dev") ||
  hostname.endsWith(".gitpod.io")

/** Who sent a call, as the fake replica reports it to a canister. */
export interface FakeCallContext {
  /**
   * The principal that sent the call: the anonymous principal, or the one
   * the signing identity names (the root of its delegation chain, if it has
   * one), after the fake has checked the request's signatures.
   */
  readonly caller: Principal
}

/**
 * A canister the fake replica routes calls to, by method name and raw Candid.
 *
 * Each handler receives the method name, the Candid-encoded argument and the
 * call context, and returns the Candid-encoded reply. A handler that throws
 * rejects the call as a canister trap does, and one that calls
 * {@link FakeReplica.reject} rejects it with the reject code it names. A
 * canister without `query` rejects every query, and one without `update`
 * every update call.
 */
export interface FakeCanister {
  query?(
    method: string,
    arg: Uint8Array,
    context: FakeCallContext
  ): Uint8Array | Promise<Uint8Array>
  update?(
    method: string,
    arg: Uint8Array,
    context: FakeCallContext
  ): Uint8Array | Promise<Uint8Array>
}

/** A request an agent sent to the fake replica. */
export interface FakeReplicaRequest {
  readonly endpoint: "status" | "query" | "call" | "read_state"
  /** The canister the request was addressed to, as text. */
  readonly canisterId?: string
  /**
   * The effective canister id the agent put in the request path
   * (`/api/v3/canister/<id>/call`), as text. It is the canister the request is
   * routed by, and it differs from {@link FakeReplicaRequest.canisterId} when
   * a call goes to the management canister (`aaaaa-aa`), where the client
   * chooses it from the call's arguments. Set on `query`, `call` and
   * `read_state` requests.
   */
  readonly effectiveCanisterId?: string
  /** The canister method a query or call named. */
  readonly methodName?: string
  /** The principal the request came from, as text, once it was checked. */
  readonly caller?: string
  /**
   * Why the fake refused the request before any canister saw it: either the
   * signature, a delegation, or its targets did not check out, as a replica
   * refuses it (HTTP 400), or {@link FakeReplica.refuseNext} told the fake to
   * answer with an HTTP status.
   */
  readonly refused?: string
  /**
   * Whether the reply to this request was lost by
   * {@link FakeReplica.dropNextReply}: the agent saw a network failure. The
   * first send of a dropped call ran the canister; a re-send of it did not.
   */
  readonly dropped?: true
}

/** Options for {@link createFakeReplica} and {@link installFakeReplica}. */
export interface FakeReplicaOptions {
  /**
   * The origin the fake answers for. Point the agents under test at it, for
   * example with `HttpAgent.createSync({ host: replica.host, ... })`.
   *
   * @defaultValue The page's origin when the test environment has a local one
   * (`http://localhost:3000` in Vitest's jsdom and happy-dom), which is where
   * an agent built with no `host` calls, and `"http://127.0.0.1:4943"`
   * otherwise.
   */
  host?: string
  /**
   * The canisters the fake runs, by canister ID. A call to any other
   * canister is rejected, as a replica rejects a call to a canister that
   * does not exist.
   */
  canisters?: Record<string, FakeCanister>
}

/**
 * The reject codes a canister call can end with, as the Internet Computer
 * interface specification numbers them: `1` SYS_FATAL, `2` SYS_TRANSIENT,
 * `3` DESTINATION_INVALID, `4` CANISTER_REJECT, `5` CANISTER_ERROR and `6`
 * SYS_UNKNOWN.
 */
export type FakeRejectCode = 1 | 2 | 3 | 4 | 5 | 6

/** A fake replica made by {@link createFakeReplica}. */
export interface FakeReplica {
  /** The origin the fake answers for. */
  readonly host: string
  /**
   * The DER-encoded root key the fake signs certificates with. Each fake has
   * its own. Pass it as `rootKey` to an agent that does not fetch its root
   * key, or let the agent fetch it from the fake with `shouldFetchRootKey`.
   */
  readonly rootKey: Uint8Array
  /**
   * The `fetch` to give an agent, as `HttpAgent.createSync({ host, fetch,
   * rootKey })`. It answers the IC API on {@link FakeReplica.host} and
   * refuses the IC API on any other origin with a network error, which it
   * also logs once, so an agent built for the wrong host fails at once. It
   * does not touch `globalThis.fetch`.
   */
  readonly fetch: typeof globalThis.fetch
  /** Every request an agent sent to the fake, in order. */
  readonly requests: readonly FakeReplicaRequest[]
  /**
   * Runs a canister at `canisterId`, replacing the one already there. For a
   * canister that is not known when the fake is created.
   */
  addCanister(canisterId: string, canister: FakeCanister): void
  /**
   * Rejects the call being handled with `code`, as a canister does: call it
   * from inside a canister handler. An update is rejected in a certificate,
   * as a replica certifies a reject, and a query is rejected in the signed
   * query response.
   *
   * @param code - The reject code the agent receives.
   * @param message - The reject message. A default naming the code is used
   * when it is left out.
   */
  reject(code: FakeRejectCode, message?: string): never
  /**
   * Loses the reply to the next update call. The canister runs and its state
   * changes, but the agent sees a network failure instead of the answer, so
   * it cannot know the call happened.
   *
   * The request is remembered, and every send of it, and every `read_state`
   * of its status, fails as a lost connection without running the canister
   * again. The agent's own retries, which re-send the same request, therefore
   * cannot recover the reply and cannot run the call twice, and the agent
   * cannot learn the outcome by polling. A real replica would still answer a
   * `read_state` for a request id it holds: the fake models a network
   * partition for that one request id, so the call stays outcome-unknown.
   */
  dropNextReply(): void
  /**
   * Answers the next `times` canister requests (a `query` or a `call`) with an
   * HTTP error `status` before any canister sees them, as a gateway or a
   * replica does when it throttles or refuses a request. The status endpoint
   * and `read_state`, which an agent makes on its own, are not counted.
   *
   * An agent retries a refused request on its own unless it is built with
   * `retryTimes: 0`; `times` is how many sends to refuse, so a test can refuse
   * the first and let a retry through.
   *
   * Given {@link FakeRefusal} options instead of a count, it refuses only the
   * requests that name `method` and are addressed to `canister` (each one
   * that is given), and lets every other request through. A request that
   * several armed refusals match is refused by the one armed first.
   *
   * @param status - An HTTP error status, from 400 to 599.
   * @param times - How many requests to refuse, or which ones and how many.
   * @defaultValue 1
   */
  refuseNext(status: number, times?: number | FakeRefusal): void
}

/**
 * Which canister requests {@link FakeReplica.refuseNext} refuses, and how
 * many. A request matches when it names `method` and is addressed to
 * `canister`, each when it is given: options with neither match any query or
 * call, as a count does.
 */
export interface FakeRefusal {
  /**
   * The method a matching `query` or `call` names. A query and a replicated
   * call of the same method both match.
   */
  readonly method?: string
  /**
   * The canister a matching request is addressed to, as text: the canister
   * the request names, not the effective canister it is routed by, so
   * `aaaaa-aa` for a call to the management canister. It need not run on
   * the fake: a gateway refuses a request for a canister that does not exist.
   */
  readonly canister?: string
  /**
   * How many matching requests to refuse: each send counts, an agent's own
   * re-send of a refused request included.
   *
   * @defaultValue 1
   */
  readonly times?: number
}

/** The options of {@link FakeRefusal}, for the message of one that is not. */
const REFUSAL_OPTIONS = ["method", "canister", "times"] as const

/** A fake replica installed by {@link installFakeReplica}. */
export interface InstalledFakeReplica extends FakeReplica {
  /**
   * Takes the fake out of `globalThis.fetch`, putting back the `fetch` it
   * replaced, along with any wrapper a test installed around it since.
   * Calling it again does nothing, and several fakes may be restored in any
   * order: one installed over this fake keeps its place. An agent built while
   * the fake was installed keeps calling it.
   */
  restore(): void
}

/**
 * Rejects a call with a reject code. Thrown by {@link FakeReplica.reject}.
 *
 * @internal
 */
export class FakeReplicaReject extends Error {
  constructor(
    readonly rejectCode: number,
    readonly errorCode: string | undefined,
    message: string
  ) {
    super(message)
    this.name = "FakeReplicaReject"
  }
}

/**
 * Thrown out of the fake's `fetch` when a reply is lost, in the form of a
 * network failure.
 */
class LostReply extends TypeError {}

const DEFAULT_HOST = "http://127.0.0.1:4943"

/**
 * The page's origin when it is one the fake can answer for, which is where an
 * agent built with no `host` calls: a local or remote development origin,
 * such as jsdom's `http://localhost:3000`. A mainnet origin is left out, as
 * its agents check certificates against mainnet's root key.
 */
function localPageOrigin(): string | undefined {
  try {
    const origin = (globalThis as { location?: { origin?: string } }).location
      ?.origin
    if (!origin) return undefined
    const { protocol, hostname } = new URL(origin)
    return (protocol === "http:" || protocol === "https:") &&
      isNonMainnetPageHost(hostname)
      ? origin
      : undefined
  } catch {
    // No page (Node), an opaque origin ("null"), or a `location` that throws.
    return undefined
  }
}

/**
 * The IC HTTP API paths an agent requests: the status endpoint, and a
 * canister's or subnet's `query`, `call` and `read_state`. Anything else, such
 * as an app's own `/api/v1/...` REST calls, is not the fake's to answer.
 */
const IC_API_PATH =
  /^\/api\/v\d+\/(?:status|(?:canister|subnet)\/[^/]+\/(?:query|call|read_state))$/

/**
 * The URL a request is for. An agent always asks for an absolute one; an app
 * may ask for a path, which a browser, happy-dom or a request mock such as
 * MSW reads against the page. `undefined` when it cannot be read at all.
 */
function urlOf(input: RequestInfo | URL): URL | undefined {
  const raw = input instanceof Request ? input.url : String(input)
  let base: string | undefined
  try {
    base = (globalThis as { location?: { href?: string } }).location?.href
  } catch {
    base = undefined
  }
  try {
    return new URL(raw, base)
  } catch {
    return undefined
  }
}

/** Marks a `fetch` that {@link installFakeReplica} put in place. */
const FAKE_REPLICA_FETCH = Symbol.for("@ic-reactor/core/testing/fakeReplica")

type Fetch = typeof globalThis.fetch

/** What an installed fake replica's `fetch` knows about its place in the chain. */
interface FakeReplicaLink {
  /** The `fetch` the fake replaced. */
  readonly previous: Fetch
  /** Whether its `restore()` has been called. */
  restored: boolean
}

// A test environment may have had no `fetch` before the fake installed one.
const linkOf = (fetch: Fetch | undefined): FakeReplicaLink | undefined =>
  typeof fetch === "function"
    ? (fetch as Fetch & { [FAKE_REPLICA_FETCH]?: FakeReplicaLink })[
        FAKE_REPLICA_FETCH
      ]
    : undefined

/**
 * The `fetch` to put back in place of a fake: the one it replaced, past any
 * fakes under it that were restored while this one was installed over them.
 */
function liveFetchUnder(link: FakeReplicaLink): Fetch {
  let fetch = link.previous
  for (let under = linkOf(fetch); under?.restored; under = linkOf(fetch)) {
    fetch = under.previous
  }
  return fetch
}

const encoder = new TextEncoder()
// Copied: a jsdom test setup often installs Node's `TextEncoder`, whose bytes
// come from another realm than the environment's `Uint8Array`. The CBOR
// encoder does not recognise them as bytes and writes them out as a map.
const utf8 = (text: string) => new Uint8Array(encoder.encode(text))

/** A subtree to certify: a leaf's bytes, or labelled children. */
type TreeNode = Uint8Array | Array<[string | Uint8Array, TreeNode]>

function compareBytes(a: Uint8Array, b: Uint8Array): number {
  const length = Math.min(a.length, b.length)
  for (let i = 0; i < length; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i]
  }
  return a.length - b.length
}

function toHashTree(node: TreeNode): HashTree {
  if (!Array.isArray(node)) {
    return [NodeType.Leaf, node] as HashTree
  }
  // Ascending, because the agent's label search stops at the first label
  // greater than the one it wants.
  const labelled = node
    .map(([label, child]) => ({
      label: typeof label === "string" ? utf8(label) : label,
      child,
    }))
    .sort((a, b) => compareBytes(a.label, b.label))
    .map(
      ({ label, child }) =>
        [NodeType.Labeled, label, toHashTree(child)] as HashTree
    )
  return fork(labelled)
}

function fork(nodes: HashTree[]): HashTree {
  if (nodes.length === 0) return [NodeType.Empty]
  if (nodes.length === 1) return nodes[0]
  const middle = Math.ceil(nodes.length / 2)
  return [
    NodeType.Fork,
    fork(nodes.slice(0, middle)),
    fork(nodes.slice(middle)),
  ]
}

function leb128(value: bigint): Uint8Array {
  const out: number[] = []
  let rest = value
  do {
    let byte = Number(rest & 0x7fn)
    rest >>= 7n
    if (rest !== 0n) byte |= 0x80
    out.push(byte)
  } while (rest !== 0n)
  return new Uint8Array(out)
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

const nowNanos = () => BigInt(Date.now()) * 1_000_000n

function cborResponse(body: unknown, status = 200): Response {
  return new Response(Cbor.encode(body) as BodyInit, {
    status,
    headers: { "content-type": "application/cbor" },
  })
}

interface Envelope {
  content: {
    canister_id?: Uint8Array
    method_name?: string
    arg?: Uint8Array
    paths?: Uint8Array[][]
    sender: Uint8Array
  }
  sender_pubkey?: Uint8Array
  sender_sig?: Uint8Array
  sender_delegation?: Array<{
    delegation: {
      pubkey: Uint8Array
      expiration: bigint | number
      targets?: Uint8Array[]
    }
    signature: Uint8Array
  }>
}

// The DER prefix of each kind of key an identity in `@icp-sdk/core` signs
// with, before the raw key: Ed25519, ECDSA on P-256 (`ECDSAKeyIdentity`, and
// the session keys `@icp-sdk/auth` makes) and ECDSA on secp256k1.
const hex = (text: string) =>
  Uint8Array.from(text.match(/../g) ?? [], (byte) => parseInt(byte, 16))
const ED25519_SPKI_PREFIX = hex("302a300506032b6570032100")
const P256_SPKI_PREFIX = hex(
  "3059301306072a8648ce3d020106082a8648ce3d030107034200"
)
const SECP256K1_SPKI_PREFIX = hex(
  "3056301006072a8648ce3d020106052b8104000a034200"
)

const startsWith = (bytes: Uint8Array, prefix: Uint8Array) =>
  bytes.length > prefix.length && prefix.every((byte, i) => bytes[i] === byte)

/**
 * Whether `signature` is the signature of the key `publicKey` (DER) over
 * `message`, or `undefined` for a kind of key the fake cannot check.
 */
function verifySignature(
  publicKey: Uint8Array,
  signature: Uint8Array,
  message: Uint8Array
): boolean | undefined {
  try {
    if (startsWith(publicKey, ED25519_SPKI_PREFIX)) {
      const raw = publicKey.subarray(ED25519_SPKI_PREFIX.length)
      return ed25519.verify(signature, message, raw)
    }
    if (startsWith(publicKey, P256_SPKI_PREFIX)) {
      // WebCrypto, which signs for `ECDSAKeyIdentity`, does not normalise S.
      const raw = publicKey.subarray(P256_SPKI_PREFIX.length)
      return p256.verify(signature, message, raw, { lowS: false })
    }
    if (startsWith(publicKey, SECP256K1_SPKI_PREFIX)) {
      const raw = publicKey.subarray(SECP256K1_SPKI_PREFIX.length)
      return secp256k1.verify(signature, message, raw)
    }
  } catch {
    // A malformed key or signature does not verify.
    return false
  }
  return undefined
}

/** A canister's reply, or the reject a replica sends in its place. */
type Outcome =
  | { reply: Uint8Array }
  | { reject: { code: number; message: string; errorCode?: string } }

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

/** Lower-case hex of `bytes`: a map key for a request id. */
const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")

/** The names the interface specification gives each reject code. */
const REJECT_NAMES: Record<FakeRejectCode, string> = {
  1: "SYS_FATAL",
  2: "SYS_TRANSIENT",
  3: "DESTINATION_INVALID",
  4: "CANISTER_REJECT",
  5: "CANISTER_ERROR",
  6: "SYS_UNKNOWN",
}

/**
 * How an installed fake hands on a request that is not its own to answer.
 * Returns the answer, or `undefined` for the fake to refuse the request.
 */
type PassOn = (
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  why: "not-ic-api" | "other-origin"
) => Promise<Response> | undefined

function buildFakeReplica(
  options: FakeReplicaOptions,
  passOn?: PassOn
): FakeReplica {
  const host = new URL(options.host ?? localPageOrigin() ?? DEFAULT_HOST).origin
  const canisters: Record<string, FakeCanister> = {}
  const requests: FakeReplicaRequest[] = []

  // Throws for an ID that is not a canister ID.
  function canisterIdOf(id: string): Principal {
    try {
      return Principal.fromText(id)
    } catch {
      throw new Error(
        `fake replica: "${id}" in \`canisters\` is not a canister ID`
      )
    }
  }
  function addCanister(id: string, canister: FakeCanister) {
    canisters[canisterIdOf(id).toText()] = canister
  }
  for (const [id, canister] of Object.entries(options.canisters ?? {})) {
    addCanister(id, canister)
  }

  const secretKey = bls12_381.utils.randomSecretKey()
  const rootKey = wrapDER(
    bls12_381.shortSignatures.getPublicKey(secretKey).toBytes(),
    BLS12_381_G2_OID
  )
  // With no delegation in its certificates, the subnet an agent checks node
  // keys and canister ranges under is the one the root key names.
  const subnetId = Principal.selfAuthenticating(rootKey)
  const node = Ed25519KeyIdentity.generate()
  const nodeKey = new Uint8Array(node.getPublicKey().toDer())
  const nodeId = Principal.selfAuthenticating(nodeKey)

  // The fault hooks' state: how many update replies are still to be lost,
  // the refusals still armed, in the order they were armed, and the calls
  // whose reply was lost.
  let repliesToLose = 0
  const refusals: Array<{
    readonly status: number
    readonly method: string | undefined
    readonly canister: string | undefined
    left: number
  }> = []
  const lostRequests = new Set<string>()

  /**
   * The status to refuse a `query` or `call` with, from the first armed
   * refusal it matches, which it uses up; `undefined` to let it through.
   */
  function refusalFor(canisterId: string, method: string | undefined) {
    const index = refusals.findIndex(
      (refusal) =>
        (refusal.method === undefined || refusal.method === method) &&
        (refusal.canister === undefined || refusal.canister === canisterId)
    )
    if (index === -1) return undefined
    const refusal = refusals[index]
    refusal.left -= 1
    if (refusal.left === 0) refusals.splice(index, 1)
    return refusal.status
  }

  async function certify(entries: Array<[string, TreeNode]>) {
    const tree = toHashTree([...entries, ["time", leb128(nowNanos())]])
    const rootHash = await reconstruct(tree)
    const message = bls12_381.shortSignatures.hash(
      concat(IC_STATE_ROOT_DOMAIN_SEPARATOR, rootHash)
    )
    const signature = bls12_381.shortSignatures.sign(message, secretKey)
    return Cbor.encode({ tree, signature: signature.toBytes() })
  }

  /**
   * Who sent `envelope`, checked as a replica checks it, or why it is refused.
   */
  function authenticate(
    envelope: Envelope,
    canisterId: string
  ): Principal | string {
    const sender = Principal.fromUint8Array(envelope.content.sender)
    const { sender_pubkey, sender_sig, sender_delegation = [] } = envelope

    if (sender.isAnonymous()) {
      return sender_pubkey || sender_sig
        ? "an anonymous request carries a signature"
        : sender
    }
    if (!sender_pubkey || !sender_sig) {
      return "the request is not signed"
    }
    if (
      Principal.selfAuthenticating(sender_pubkey).toText() !== sender.toText()
    ) {
      return "the sender is not the principal of sender_pubkey"
    }

    const now = nowNanos()
    let signer = sender_pubkey
    for (const { delegation, signature } of sender_delegation) {
      const challenge = concat(
        IC_REQUEST_AUTH_DELEGATION_DOMAIN_SEPARATOR,
        requestIdOf(delegation)
      )
      const signed = verifySignature(signer, signature, challenge)
      if (signed === undefined) {
        return "a delegation is signed by a kind of key the fake replica cannot check"
      }
      if (!signed) {
        return "a delegation is not signed by the key before it"
      }
      if (BigInt(delegation.expiration) <= now) {
        return "a delegation has expired"
      }
      if (
        delegation.targets &&
        !delegation.targets.some(
          (target) => Principal.fromUint8Array(target).toText() === canisterId
        )
      ) {
        return `a delegation does not allow calls to ${canisterId}`
      }
      signer = delegation.pubkey
    }

    const message = concat(
      IC_REQUEST_DOMAIN_SEPARATOR,
      requestIdOf(envelope.content)
    )
    const signed = verifySignature(signer, sender_sig, message)
    if (signed === undefined) {
      return "the request is signed by a kind of key the fake replica cannot check"
    }
    if (!signed) {
      return "sender_sig is not the signing key's signature over the request"
    }
    return sender
  }

  /** Runs a canister's handler, and turns what it throws into a reject. */
  async function execute(
    kind: "query" | "update",
    canisterId: string,
    method: string,
    arg: Uint8Array,
    caller: Principal
  ): Promise<Outcome> {
    const reject = (
      code: number,
      errorCode: string | undefined,
      message: string
    ): Outcome => ({ reject: { code, errorCode, message } })

    const canister = Object.prototype.hasOwnProperty.call(canisters, canisterId)
      ? canisters[canisterId]
      : undefined
    if (!canister) {
      return reject(
        ReplicaRejectCode.DestinationInvalid,
        "IC0301",
        `fake replica: no canister is installed at ${canisterId}`
      )
    }
    const handler = kind === "query" ? canister.query : canister.update
    if (!handler) {
      return reject(
        ReplicaRejectCode.DestinationInvalid,
        "IC0536",
        `fake replica: canister ${canisterId} answers no ${kind === "query" ? "queries" : "update calls"}`
      )
    }
    try {
      return {
        reply: new Uint8Array(
          await handler.call(canister, method, arg, { caller })
        ),
      }
    } catch (error) {
      if (error instanceof FakeReplicaReject) {
        return reject(error.rejectCode, error.errorCode, error.message)
      }
      return reject(
        ReplicaRejectCode.CanisterError,
        "IC0503",
        `Canister ${canisterId} trapped: ${messageOf(error)}`
      )
    }
  }

  async function handleQuery(
    canisterId: string,
    effectiveCanisterId: string,
    envelope: Envelope,
    caller: Principal
  ) {
    const { method_name = "", arg = new Uint8Array() } = envelope.content
    requests.push({
      endpoint: "query",
      canisterId,
      effectiveCanisterId,
      methodName: method_name,
      caller: caller.toText(),
    })
    const outcome = await execute("query", canisterId, method_name, arg, caller)
    const timestamp = nowNanos()
    const request_id = requestIdOf(envelope.content)
    const body =
      "reply" in outcome
        ? { status: "replied", reply: { arg: outcome.reply } }
        : {
            status: "rejected",
            reject_code: outcome.reject.code,
            reject_message: outcome.reject.message,
            ...(outcome.reject.errorCode === undefined
              ? {}
              : { error_code: outcome.reject.errorCode }),
          }
    const hash = hashOfMap({ ...body, timestamp, request_id })
    const signature = await node.sign(
      concat(IC_RESPONSE_DOMAIN_SEPARATOR, hash)
    )
    return cborResponse({
      ...body,
      signatures: [
        {
          timestamp,
          signature: new Uint8Array(signature),
          identity: nodeId.toUint8Array(),
        },
      ],
    })
  }

  async function handleCall(
    canisterId: string,
    effectiveCanisterId: string,
    envelope: Envelope,
    caller: Principal
  ) {
    const { method_name = "", arg = new Uint8Array() } = envelope.content
    const requestId = toHex(requestIdOf(envelope.content))
    // A request id whose reply was lost stays lost: a re-send is neither run
    // nor answered again, and its status cannot be read (see
    // `readsLostRequest`). That models a partition for that one request id,
    // not what a replica does, which would still answer a `read_state`.
    const resent = lostRequests.has(requestId)
    const lose = resent || repliesToLose > 0
    if (lose && !resent) {
      repliesToLose -= 1
      lostRequests.add(requestId)
    }
    requests.push({
      endpoint: "call",
      canisterId,
      effectiveCanisterId,
      methodName: method_name,
      caller: caller.toText(),
      ...(lose ? { dropped: true as const } : {}),
    })
    if (resent) throw lostReply(method_name)

    const outcome = await execute(
      "update",
      canisterId,
      method_name,
      arg,
      caller
    )
    // The canister has run and its state has changed; only the answer is lost.
    if (lose) throw lostReply(method_name)

    const status: Array<[string, TreeNode]> =
      "reply" in outcome
        ? [
            ["status", utf8("replied")],
            ["reply", outcome.reply],
          ]
        : [
            ["status", utf8("rejected")],
            ["reject_code", leb128(BigInt(outcome.reject.code))],
            ["reject_message", utf8(outcome.reject.message)],
            ...(outcome.reject.errorCode === undefined
              ? []
              : ([["error_code", utf8(outcome.reject.errorCode)]] as Array<
                  [string, TreeNode]
                >)),
          ]
    const certificate = await certify([
      ["request_status", [[requestIdOf(envelope.content), status]]],
    ])
    return cborResponse({ status: "replied", certificate })
  }

  /** Whether `envelope` reads the status of a call whose reply was lost. */
  const readsLostRequest = (envelope: Envelope) =>
    (envelope.content.paths ?? []).some(
      ([label, id]) =>
        label !== undefined &&
        id !== undefined &&
        new TextDecoder().decode(label) === "request_status" &&
        lostRequests.has(toHex(id))
    )

  async function handleReadState(canisterId: string) {
    requests.push({
      endpoint: "read_state",
      canisterId,
      effectiveCanisterId: canisterId,
    })
    // The subnet holds the installed canisters and the one asked about, so a
    // query to a canister that is not installed reaches the canister lookup
    // and is rejected there, rather than failing the agent's range check.
    const inSubnet = [
      ...Object.keys(canisters).map((id) => Principal.fromText(id)),
      Principal.fromText(canisterId),
    ]
      .map((id) => id.toUint8Array())
      .sort(compareBytes)
      .filter((id, i, ids) => i === 0 || compareBytes(ids[i - 1], id) !== 0)
    const certificate = await certify([
      [
        "subnet",
        [
          [
            subnetId.toUint8Array(),
            [
              ["canister_ranges", Cbor.encode(inSubnet.map((id) => [id, id]))],
              ["node", [[nodeId.toUint8Array(), [["public_key", nodeKey]]]]],
            ],
          ],
        ],
      ],
    ])
    return cborResponse({ certificate })
  }

  // Origins a misrouted IC API request came from, each logged once.
  const misrouted = new Set<string>()

  const fakeFetch = async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const url = urlOf(input)
    if (!url || !IC_API_PATH.test(url.pathname)) {
      const passed = passOn?.(input, init, "not-ic-api")
      if (passed) return passed
      throw new TypeError(
        `fake replica: ${url?.href ?? String(input)} is not an IC API request, ` +
          `which is all the fake answers`
      )
    }

    if (url.origin !== host) {
      const passed = passOn?.(input, init, "other-origin")
      if (passed) return passed
      const message =
        `fake replica: no route to ${url.origin}. The fake answers ${host}; ` +
        `build the agent with \`host: replica.host\` and \`fetch: replica.fetch\`, ` +
        `or create the fake with \`host: "${url.origin}"\``
      // The agent retries a failed request, and a query hook retries a
      // failed query, so the error below can surface long after the test
      // timed out. Logged here, the cause shows up at once.
      if (!misrouted.has(url.origin)) {
        misrouted.add(url.origin)
        console.error(message)
      }
      throw new TypeError(message)
    }

    if (url.pathname === "/api/v2/status") {
      requests.push({ endpoint: "status" })
      return cborResponse({
        ic_api_version: "0.18.0",
        impl_version: "fake",
        replica_health_status: "healthy",
        root_key: rootKey,
      })
    }

    const match =
      /^\/api\/v[234]\/canister\/([^/]+)\/(query|call|read_state)$/.exec(
        url.pathname
      )
    if (!match) {
      return new Response(`fake replica: no endpoint ${url.pathname}`, {
        status: 404,
      })
    }

    const [, effectiveCanisterId, path] = match
    const endpoint = path as "query" | "call" | "read_state"

    try {
      const body = new Uint8Array(
        await new Response(
          input instanceof Request ? input.body : (init?.body as BodyInit)
        ).arrayBuffer()
      )
      const envelope = Cbor.decode(body) as Envelope
      // A call goes to the canister it names, as on a replica. The path
      // names the effective canister, which only routes the request to a
      // subnet and differs when the caller passes `effectiveCanisterId`.
      const canisterId = envelope.content.canister_id
        ? Principal.fromUint8Array(envelope.content.canister_id).toText()
        : effectiveCanisterId

      // Before the signatures are read, as a gateway refuses a request.
      const status =
        endpoint === "read_state"
          ? undefined
          : refusalFor(canisterId, envelope.content.method_name)
      if (status !== undefined) {
        const refused = `refuseNext(${status}) answered the request with HTTP ${status}`
        requests.push({
          endpoint,
          canisterId,
          effectiveCanisterId,
          methodName: envelope.content.method_name,
          refused,
        })
        return new Response(`fake replica: ${refused}`, { status })
      }

      const caller = authenticate(envelope, canisterId)
      if (typeof caller === "string") {
        requests.push({
          endpoint,
          canisterId,
          effectiveCanisterId,
          methodName: envelope.content.method_name,
          refused: caller,
        })
        return new Response(`fake replica: ${caller}`, { status: 400 })
      }

      if (endpoint === "query") {
        return await handleQuery(
          canisterId,
          effectiveCanisterId,
          envelope,
          caller
        )
      }
      if (endpoint === "call") {
        return await handleCall(
          canisterId,
          effectiveCanisterId,
          envelope,
          caller
        )
      }
      if (readsLostRequest(envelope)) {
        requests.push({
          endpoint,
          canisterId: effectiveCanisterId,
          effectiveCanisterId,
          dropped: true,
        })
        throw lostReply()
      }
      return await handleReadState(effectiveCanisterId)
    } catch (error) {
      // A lost reply is the network failing, which the agent sees as the
      // fetch rejecting, not as an HTTP answer.
      if (error instanceof LostReply) throw error
      // A request the fake cannot read, or a bug in the fake. The agent sees
      // an HTTP error, which fails the test; the details go to its output.
      console.error("fake replica:", error)
      return new Response(
        `fake replica: the request failed: ${messageOf(error)}`,
        { status: 500 }
      )
    }
  }

  return {
    host,
    rootKey,
    fetch: fakeFetch,
    requests,
    addCanister,
    reject(code, message) {
      throw new FakeReplicaReject(
        code,
        undefined,
        message ??
          `fake replica: the canister rejected the call with reject code ${code} (${REJECT_NAMES[code]})`
      )
    },
    dropNextReply() {
      repliesToLose += 1
    },
    refuseNext(status, which = 1) {
      if (!Number.isInteger(status) || status < 400 || status > 599) {
        throw new RangeError(
          `refuseNext: ${status} is not an HTTP error status (400 to 599)`
        )
      }
      // A count, or anything that is not an object, is the published
      // `(status, times?)` form, checked as it always was.
      const options: FakeRefusal =
        typeof which === "object" && which !== null && !Array.isArray(which)
          ? which
          : { times: which as number }
      const unknown = Object.keys(options).filter(
        (key) => !(REFUSAL_OPTIONS as readonly string[]).includes(key)
      )
      if (unknown.length > 0) {
        throw new TypeError(
          `refuseNext() has no option ${unknown.join(", ")}. Its options: ${REFUSAL_OPTIONS.join(", ")}.`
        )
      }
      const { method, canister, times = 1 } = options
      if (!Number.isInteger(times) || times < 1) {
        throw new RangeError(
          `refuseNext: \`times\` is ${times}, not a count of at least 1`
        )
      }
      if (method !== undefined && (typeof method !== "string" || !method)) {
        throw new TypeError(
          `refuseNext: \`method\` is the name of a canister method, got ${
            typeof method === "string" ? '""' : typeof method
          }`
        )
      }
      let canisterId: string | undefined
      if (canister !== undefined) {
        try {
          canisterId = Principal.fromText(canister).toText()
        } catch {
          throw new TypeError(
            `refuseNext: \`canister\` is a canister id, such as "ryjl3-tyaaa-aaaaa-aaaba-cai" or "aaaaa-aa", got ${
              typeof canister === "string"
                ? JSON.stringify(canister)
                : typeof canister
            }`
          )
        }
      }
      refusals.push({ status, method, canister: canisterId, left: times })
    },
  }
}

/**
 * The error a request fails with when its reply is lost: a `fetch` rejection,
 * as a dropped connection is.
 */
const lostReply = (method?: string) =>
  new LostReply(
    `fake replica: the connection was lost before the reply${method ? ` to ${method}` : ""} arrived`
  )

/**
 * Creates a fake replica that runs `options.canisters`, to give to the agents
 * under test as their `fetch`. Nothing global is touched, so two fakes run
 * side by side in one process, each with its own root key, node key and
 * request log, and the agents that use one never reach the other.
 *
 * Point an agent at it with its `host`, its `fetch` and its root key:
 * `HttpAgent.createSync({ host: replica.host, fetch: replica.fetch, rootKey:
 * replica.rootKey })`, or pass `shouldFetchRootKey: true` instead of the
 * `rootKey` to let the agent fetch it from the fake as it does from a local
 * replica. The fake answers the IC API on `replica.host` and refuses the IC
 * API on any other origin as a network error, which it also logs once, so a
 * test never reaches a real network by mistake.
 *
 * It checks each request's signatures as a replica does, and refuses one that
 * does not verify with HTTP 400. It can check Ed25519, ECDSA P-256 and
 * secp256k1 keys, including delegation chains between them, which covers
 * `Ed25519KeyIdentity`, `ECDSAKeyIdentity`, `Secp256k1KeyIdentity` and a
 * `DelegationIdentity` built from them. It refuses any other kind of key.
 *
 * An agent keeps the node keys it reads in IndexedDB when the environment has
 * one, under a name that holds only the host. Agents of two fakes that share a
 * host therefore share cached keys. The agent notices a signature that does
 * not verify and reads fresh keys, but pass each agent its own
 * `subnetNodeKeyExpirableStore` to keep them apart.
 *
 * The signing uses `@noble/curves`, an optional peer dependency of
 * `@ic-reactor/core` that `@icp-sdk/core` already installs. Add it to your
 * devDependencies if your package manager does not let this package resolve
 * it.
 *
 * @param options - The canisters to run and the origin to answer for.
 * @returns The fake: its `fetch`, `host` and `rootKey`, the requests it
 * received, and the hooks that fail a call on purpose.
 *
 * @example
 * ```typescript
 * import { HttpAgent } from "@icp-sdk/core/agent"
 * import { IDL } from "@icp-sdk/core/candid"
 * import { createFakeReplica } from "@ic-reactor/core/testing"
 *
 * const BACKEND = "bkyz2-fmaaa-aaaaa-qaaaq-cai"
 *
 * const replica = createFakeReplica({
 *   canisters: {
 *     [BACKEND]: {
 *       query: () => new Uint8Array(IDL.encode([IDL.Text], ["Hello, Ada!"])),
 *       update: () => replica.reject(4, "not today"),
 *     },
 *   },
 * })
 * const agent = HttpAgent.createSync({
 *   host: replica.host,
 *   fetch: replica.fetch,
 *   rootKey: replica.rootKey,
 * })
 *
 * const answer = await agent.query(BACKEND, {
 *   methodName: "greet",
 *   arg: new Uint8Array(IDL.encode([IDL.Text], ["Ada"])),
 * })
 * ```
 */
export function createFakeReplica(
  options: FakeReplicaOptions = {}
): FakeReplica {
  return buildFakeReplica(options)
}

/**
 * Stubs `globalThis.fetch` with a fake replica that runs `options.canisters`,
 * for code that builds its own agents. Prefer {@link createFakeReplica}, which
 * is passed to the agents it serves and touches nothing global.
 *
 * Install it before the agents under test are built: an `HttpAgent` keeps the
 * `fetch` it found when it was built. An agent built at module scope is built
 * when its module is first imported, so install the fake in a setup file, or
 * import that module after installing it.
 *
 * Point the agents at `replica.host`. The fake answers the IC API there and
 * refuses the IC API on any other origin as a network error, which it also
 * logs once, so a test never reaches a real network by mistake. Every other
 * request, on any origin, goes to the `fetch` it replaced. A fake installed
 * while another is installed answers its own host and hands the IC API on any
 * other origin to the earlier one.
 *
 * Everything else, including the request checks and the fault hooks, is
 * {@link createFakeReplica}'s.
 *
 * @param options - The canisters to run and the origin to answer for.
 * @returns The installed replica, with a `restore()` that puts the previous
 * `fetch` back.
 */
export function installFakeReplica(
  options: FakeReplicaOptions = {}
): InstalledFakeReplica {
  const link: FakeReplicaLink = {
    previous: globalThis.fetch,
    restored: false,
  }
  const replica = buildFakeReplica(options, (input, init, why) => {
    // Read per request: a fake installed under this one may be restored since.
    const next = liveFetchUnder(link)
    return why === "other-origin" && !linkOf(next)
      ? undefined
      : next(input, init)
  })

  const fetch = Object.assign(replica.fetch, {
    [FAKE_REPLICA_FETCH]: link,
  }) as Fetch
  globalThis.fetch = fetch

  return {
    ...replica,
    restore() {
      if (link.restored) return
      link.restored = true
      // A fake installed over this one and not yet restored keeps its place,
      // and skips this one from now on. Anything else is taken out with this
      // fake: a wrapper a test put around it to drop or delay responses, as
      // it was before the fake was installed.
      const above = linkOf(globalThis.fetch)
      if (globalThis.fetch !== fetch && above && !above.restored) return
      globalThis.fetch = liveFetchUnder(link)
    },
  }
}
