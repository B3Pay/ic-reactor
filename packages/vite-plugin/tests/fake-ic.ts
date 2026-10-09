/**
 * A replica on a local port that answers what the plugin's fetch asks: its
 * status (the root key) and a canister's `read_state` of `candid:service`.
 *
 * It holds a BLS root key of its own and signs each certificate with it, as a
 * replica does, so the agent checks the certificate exactly as it would on a
 * network. Its host is local, so the plugin fetches that root key from it.
 */
import http from "node:http"
import type { AddressInfo } from "node:net"
import { bls12_381 } from "@noble/curves/bls12-381.js"
import {
  BLS12_381_G2_OID,
  Cbor,
  IC_STATE_ROOT_DOMAIN_SEPARATOR,
  NodeType,
  reconstruct,
  wrapDER,
  type HashTree,
} from "@icp-sdk/core/agent"
import { Principal } from "@icp-sdk/core/principal"

/** How the fake answers a canister's `read_state`. */
export type Canister =
  /** Its interface: certified at `candid:service`. */
  | { candid: string }
  /** No `candid:service` metadata: a certificate without the path. */
  | { absent: true }
  /** Private metadata, which a replica refuses to anyone but a controller. */
  | { private: true }

export interface FakeIc {
  /** `http://127.0.0.1:<port>`. */
  host: string
  /** Each request it received, as `"GET /api/v2/status"`. */
  requests: string[]
  close: () => Promise<void>
}

type TreeNode = Uint8Array | Array<[string | Uint8Array, TreeNode]>

const utf8 = (text: string) => new TextEncoder().encode(text)

function compareBytes(a: Uint8Array, b: Uint8Array): number {
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i]
  }
  return a.length - b.length
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

function toHashTree(node: TreeNode): HashTree {
  if (!Array.isArray(node)) return [NodeType.Leaf, node] as HashTree
  return fork(
    node
      .map(([label, child]) => ({
        label: typeof label === "string" ? utf8(label) : label,
        child,
      }))
      // Ascending, as the agent's label search expects.
      .sort((a, b) => compareBytes(a.label, b.label))
      .map(
        ({ label, child }) =>
          [NodeType.Labeled, label, toHashTree(child)] as HashTree
      )
  )
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

/** Start a fake replica serving `canisters`, by canister ID. */
export async function startFakeIc(
  canisters: Record<string, Canister>
): Promise<FakeIc> {
  const secretKey = bls12_381.utils.randomSecretKey()
  const rootKey = wrapDER(
    bls12_381.shortSignatures.getPublicKey(secretKey).toBytes(),
    BLS12_381_G2_OID
  )
  const requests: string[] = []

  const certify = async (entries: Array<[string, TreeNode]>) => {
    const now = BigInt(Date.now()) * 1_000_000n
    const tree = toHashTree([...entries, ["time", leb128(now)]])
    const rootHash = await reconstruct(tree)
    const message = new Uint8Array([
      ...IC_STATE_ROOT_DOMAIN_SEPARATOR,
      ...rootHash,
    ])
    const signature = bls12_381.shortSignatures.sign(
      bls12_381.shortSignatures.hash(message),
      secretKey
    )
    return Cbor.encode({ tree, signature: signature.toBytes() })
  }

  const send = (
    res: http.ServerResponse,
    status: number,
    body: Uint8Array | string
  ) => {
    res.writeHead(status, {
      "content-type":
        typeof body === "string" ? "text/plain" : "application/cbor",
    })
    res.end(body)
  }

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on("data", (chunk: Buffer) => chunks.push(chunk))
    req.on("end", () => {
      void (async () => {
        requests.push(`${req.method} ${req.url}`)
        if (req.url === "/api/v2/status") {
          send(res, 200, Cbor.encode({ root_key: rootKey }))
          return
        }
        const match = /^\/api\/v[234]\/canister\/([^/]+)\/read_state$/.exec(
          req.url ?? ""
        )
        if (!match) {
          send(res, 404, `no endpoint ${req.url}`)
          return
        }
        const id = Principal.fromText(match[1]).toText()
        const canister = canisters[id]
        if (!canister) {
          send(
            res,
            400,
            "error: canister_not_found\ndetails: The specified canister does not exist."
          )
          return
        }
        if ("private" in canister) {
          send(
            res,
            403,
            "Custom section candid:service can only be requested by the controllers of the canister."
          )
          return
        }
        const metadata: Array<[string, TreeNode]> =
          "candid" in canister
            ? [["candid:service", utf8(canister.candid)]]
            : []
        const certificate = await certify([
          [
            "canister",
            [
              [
                Principal.fromText(id).toUint8Array(),
                [
                  ["metadata", metadata],
                  ["module_hash", new Uint8Array(32)],
                ],
              ],
            ],
          ],
        ])
        send(res, 200, Cbor.encode({ certificate }))
      })().catch((error: unknown) => {
        send(res, 500, String(error))
      })
    })
  })
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve())
  )
  const { port } = server.address() as AddressInfo
  return {
    host: `http://127.0.0.1:${port}`,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections?.()
        server.close(() => resolve())
      }),
  }
}
