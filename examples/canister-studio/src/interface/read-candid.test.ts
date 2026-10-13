// @vitest-environment node
// What a verified certificate proves, read through the agent-backed source.
// The certificate is stubbed (no BLS signature), but each path is looked up
// with the agent's own `lookup_path` over a hand-built hash tree, so a
// pruned branch answers Unknown and a missing label Absent, as on mainnet.
import {
  lookup_path,
  NodeType,
  type HashTree,
  type HttpAgent,
  type KnownPath,
  type NodeHash,
  type NodeLabel,
  type NodeValue,
} from "@icp-sdk/core/agent"
import { Principal } from "@icp-sdk/core/principal"
import { describe, expect, it, vi } from "vitest"
import { createLiveInterfaceLoader } from "./live-loader.ts"
import {
  agentCandidSource,
  classifyReadError,
  UnprovenPathError,
} from "./read-candid.ts"

const ICP_LEDGER = "ryjl3-tyaaa-aaaaa-aaaba-cai"
const DID = "service : { icrc1_symbol : () -> (text) query }"
const HASH = new Uint8Array(32).fill(0xa1)

// The tree's byte types are branded; these are plain bytes.
const utf8 = (text: string) => new TextEncoder().encode(text)
const labelled = (bytes: Uint8Array, tree: HashTree): HashTree => [
  NodeType.Labeled,
  bytes as NodeLabel,
  tree,
]
const label = (text: string, tree: HashTree): HashTree =>
  labelled(utf8(text), tree)
const leaf = (bytes: Uint8Array): HashTree => [
  NodeType.Leaf,
  bytes as NodeValue,
]
const fork = (left: HashTree, right: HashTree): HashTree => [
  NodeType.Fork,
  left,
  right,
]
// What a party between the replica and the server can put in place of any
// subtree without changing the root hash.
const pruned: HashTree = [
  NodeType.Pruned,
  new Uint8Array(32).fill(7) as NodeHash,
]

type Part = "present" | "absent" | "pruned"

// canister/<id>/{metadata/candid:service, module_hash}, labels in order.
function treeOf(candid: Part, hash: Part): HashTree {
  const metadata =
    candid === "present"
      ? label("candid:service", leaf(utf8(DID)))
      : candid === "pruned"
        ? label("candid:service", pruned)
        : label("candid:args", leaf(utf8("()")))
  const children = [label("metadata", metadata)]
  if (hash === "present") children.push(label("module_hash", leaf(HASH)))
  if (hash === "pruned") children.push(label("module_hash", pruned))
  const [first, second] = children
  if (first === undefined) throw new Error("unreachable")
  return label(
    "canister",
    labelled(
      Principal.fromText(ICP_LEDGER).toUint8Array(),
      second === undefined ? first : fork(first, second)
    )
  )
}

/**
 * An agent whose read_state answers with a certificate over `tree`. Its
 * `values` map behaves as the agent's does (null for any lookup that is not
 * Found), which is what the source must not rely on.
 */
function agentOver(tree: HashTree) {
  const query = vi.fn(() => {
    throw new Error("the tmp hack query was sent")
  })
  const agent = {
    readState: vi.fn(async () => ({
      certificate: new Uint8Array(),
      verifiedCertificate: {
        lookup_path: (path: Uint8Array[]) => lookup_path(path, tree),
      },
      values: {
        get<T>(path: KnownPath<T>): T | null {
          const found = lookup_path(path.path, tree)
          return found.status === "Found" ? path.decode(found.value) : null
        },
      },
    })),
    query,
  }
  return { agent: agent as unknown as HttpAgent, query }
}

function loaderOver(tree: HashTree) {
  const { agent, query } = agentOver(tree)
  const compile = vi.fn(async () => ({
    ok: true as const,
    envelopeJson: "{}",
    interfaceId: "",
    docs: {},
    omitted: [],
  }))
  const loader = createLiveInterfaceLoader({
    source: agentCandidSource(agent),
    compile,
    compiledIn: "server",
  })
  return { loader, query, compile }
}

describe("agentCandidSource", () => {
  it("reads the candid:service and the module hash the certificate shows", async () => {
    const { agent } = agentOver(treeOf("present", "present"))
    const read = await agentCandidSource(agent).readCandidAndHash(ICP_LEDGER)
    expect(read).toEqual({ did: DID, moduleHash: HASH })
  })

  it("gives null only for what the certificate proves absent", async () => {
    const { agent } = agentOver(treeOf("absent", "absent"))
    const source = agentCandidSource(agent)
    expect(await source.readCandidAndHash(ICP_LEDGER)).toEqual({
      did: null,
      moduleHash: null,
    })
    expect(await source.readModuleHash(ICP_LEDGER)).toBeNull()
  })

  it.each([
    ["a pruned candid:service", treeOf("pruned", "present")],
    ["a pruned module_hash", treeOf("present", "pruned")],
  ])("throws for %s, which proves nothing", async (_, tree) => {
    const { agent } = agentOver(tree)
    const error: unknown = await agentCandidSource(agent)
      .readCandidAndHash(ICP_LEDGER)
      .catch((e) => e)
    expect(error).toBeInstanceOf(UnprovenPathError)
    expect(classifyReadError(error, "metadata")).toMatchObject({
      kind: "failed",
      code: "trust_error",
    })
  })

  it("throws for a pruned module_hash read alone", async () => {
    const { agent } = agentOver(treeOf("present", "pruned"))
    await expect(
      agentCandidSource(agent).readModuleHash(ICP_LEDGER)
    ).rejects.toBeInstanceOf(UnprovenPathError)
  })
})

describe("the loader over a pruned certificate", () => {
  it("never takes a pruned candid:service for an absent one: no tmp hack", async () => {
    const { loader, query } = loaderOver(treeOf("pruned", "present"))
    expect(await loader.load(ICP_LEDGER)).toMatchObject({
      ok: false,
      code: "trust_error",
    })
    expect(query).not.toHaveBeenCalled()
  })

  it("never takes a pruned module_hash for 'no module installed'", async () => {
    const { loader } = loaderOver(treeOf("absent", "pruned"))
    expect(await loader.load(ICP_LEDGER)).toMatchObject({
      ok: false,
      code: "trust_error",
    })
  })

  it("falls back only when the certificate proves the metadata absent", async () => {
    const { loader, query } = loaderOver(treeOf("absent", "present"))
    await loader.load(ICP_LEDGER)
    expect(query).toHaveBeenCalled()
  })
})
