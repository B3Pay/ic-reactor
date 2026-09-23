/**
 * A fake replica, reached through the global `fetch` an `HttpAgent` binds when
 * it is constructed. Adapted from `packages/react/tests/auth/fake-replica.ts`.
 *
 * It holds its own root key and node key, and signs what a replica signs: a BLS
 * signature over each certificate and a node signature over each query
 * response. The agent verifies both exactly as it would against a replica, so
 * nothing in the agent is mocked, and an agent that checks a certificate
 * against the wrong root key fails here as it would there.
 *
 * It implements the endpoints an agent uses for calls and nothing else:
 * `/api/v2/status` (the root key), `/api/v3/canister/<id>/query`,
 * `/api/v3/canister/<id>/read_state` (the subnet's node keys and canister
 * ranges, which an agent reads before it trusts a query) and
 * `/api/v4/canister/<id>/call`, which always answers synchronously.
 *
 * Unlike the React copy it does not check request signatures: the caller a
 * canister sees is the request's `sender`.
 */
import { bls12_381 } from "@noble/curves/bls12-381.js"
import {
  BLS12_381_G2_OID,
  Cbor,
  IC_RESPONSE_DOMAIN_SEPARATOR,
  IC_STATE_ROOT_DOMAIN_SEPARATOR,
  NodeType,
  hashOfMap,
  reconstruct,
  requestIdOf,
  wrapDER,
  type HashTree,
} from "@icp-sdk/core/agent"
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity"
import { Principal } from "@icp-sdk/core/principal"

/** Who sent a request, as the replica reports it to a canister. */
export interface FakeCallContext {
  caller: Principal
}

/**
 * A canister the fake routes requests to. A handler receives the raw Candid
 * argument and returns the raw Candid reply.
 */
export interface FakeCanister {
  query?(method: string, arg: Uint8Array, context: FakeCallContext): Uint8Array
  update?(method: string, arg: Uint8Array, context: FakeCallContext): Uint8Array
}

export interface ReplicaRequest {
  endpoint: "status" | "query" | "call" | "read_state"
  canisterId?: string
  methodName?: string
}

export interface FakeReplica {
  /** The DER-encoded root key the fake signs certificates with. */
  readonly rootKey: Uint8Array
  /** Every request an agent sent to the fake, in order. */
  readonly requests: ReplicaRequest[]
  restore(): void
}

export interface FakeReplicaOptions {
  /** Origin the fake answers for, e.g. `http://127.0.0.1:4943`. */
  host: string
  canisters: Record<string, FakeCanister>
}

const utf8 = (text: string) => new Uint8Array(new TextEncoder().encode(text))

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
    method_name?: string
    arg?: Uint8Array
    sender: Uint8Array
  }
}

/**
 * Stubs `globalThis.fetch` for `options.host`. Install it before the agents
 * are built: an agent keeps the `fetch` it found at construction.
 */
export function installFakeReplica(options: FakeReplicaOptions): FakeReplica {
  const origin = new URL(options.host).origin
  const requests: ReplicaRequest[] = []

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

  const canisterIds = Object.keys(options.canisters)
    .map((id) => Principal.fromText(id))
    .sort((a, b) => compareBytes(a.toUint8Array(), b.toUint8Array()))
  const canisterRanges = Cbor.encode(
    canisterIds.map((id) => [id.toUint8Array(), id.toUint8Array()])
  )

  async function certify(entries: Array<[string, TreeNode]>) {
    const tree = toHashTree([...entries, ["time", leb128(nowNanos())]])
    const rootHash = await reconstruct(tree)
    const message = bls12_381.shortSignatures.hash(
      concat(IC_STATE_ROOT_DOMAIN_SEPARATOR, rootHash)
    )
    const signature = bls12_381.shortSignatures.sign(message, secretKey)
    return Cbor.encode({ tree, signature: signature.toBytes() })
  }

  function canisterFor(canisterId: string): FakeCanister {
    const canister = options.canisters[canisterId]
    if (!canister) {
      throw new Error(`fake replica: no canister ${canisterId}`)
    }
    return canister
  }

  async function handleQuery(canisterId: string, envelope: Envelope) {
    const { method_name = "", arg = new Uint8Array() } = envelope.content
    const caller = Principal.fromUint8Array(envelope.content.sender)
    requests.push({ endpoint: "query", canisterId, methodName: method_name })
    const handler = canisterFor(canisterId).query
    if (!handler) {
      throw new Error(`fake replica: ${canisterId} answers no queries`)
    }
    const reply = { arg: handler(method_name, arg, { caller }) }
    const timestamp = nowNanos()
    const hash = hashOfMap({
      status: "replied",
      reply,
      timestamp,
      request_id: requestIdOf(envelope.content),
    })
    const signature = await node.sign(
      concat(IC_RESPONSE_DOMAIN_SEPARATOR, hash)
    )
    return cborResponse({
      status: "replied",
      reply,
      signatures: [
        {
          timestamp,
          signature: new Uint8Array(signature),
          identity: nodeId.toUint8Array(),
        },
      ],
    })
  }

  async function handleCall(canisterId: string, envelope: Envelope) {
    const { method_name = "", arg = new Uint8Array() } = envelope.content
    const caller = Principal.fromUint8Array(envelope.content.sender)
    requests.push({ endpoint: "call", canisterId, methodName: method_name })
    const handler = canisterFor(canisterId).update
    if (!handler) {
      throw new Error(`fake replica: ${canisterId} answers no updates`)
    }
    const reply = handler(method_name, arg, { caller })
    const certificate = await certify([
      [
        "request_status",
        [
          [
            requestIdOf(envelope.content),
            [
              ["status", utf8("replied")],
              ["reply", reply],
            ],
          ],
        ],
      ],
    ])
    return cborResponse({ status: "replied", certificate })
  }

  async function handleReadState(canisterId: string) {
    requests.push({ endpoint: "read_state", canisterId })
    const certificate = await certify([
      [
        "subnet",
        [
          [
            subnetId.toUint8Array(),
            [
              ["canister_ranges", canisterRanges],
              ["node", [[nodeId.toUint8Array(), [["public_key", nodeKey]]]]],
            ],
          ],
        ],
      ],
    ])
    return cborResponse({ certificate })
  }

  const originalFetch = globalThis.fetch

  const fakeFetch = async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    if (url.origin !== origin) {
      throw new TypeError(`fake replica: no route to ${url.origin}`)
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
      /^\/api\/v[34]\/canister\/([^/]+)\/(query|call|read_state)$/.exec(
        url.pathname
      )
    if (!match) {
      return new Response(`fake replica: no endpoint ${url.pathname}`, {
        status: 404,
      })
    }

    const [, canisterId, endpoint] = match
    const body = new Uint8Array(
      await new Response(init?.body as BodyInit).arrayBuffer()
    )
    const envelope = Cbor.decode(body) as Envelope

    try {
      if (endpoint === "query") return await handleQuery(canisterId, envelope)
      if (endpoint === "call") return await handleCall(canisterId, envelope)
      return await handleReadState(canisterId)
    } catch (error) {
      // A bug in the fake or in a canister handler. The agent sees an HTTP
      // error, which fails the test; the details go to the test output.
      console.error("fake replica:", error)
      return new Response("fake replica: the request handler threw", {
        status: 500,
      })
    }
  }

  globalThis.fetch = fakeFetch as typeof fetch

  return {
    rootKey,
    requests,
    restore() {
      globalThis.fetch = originalFetch
    },
  }
}
