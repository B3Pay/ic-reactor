// What a verified certificate proves, read through the agent-backed source,
// and the agent `createReadAgent` builds. The certificate is stubbed (no BLS
// signature), but each path is looked up with the agent's own `lookup_path`
// over a hand-built hash tree, so a pruned branch answers Unknown and a
// missing label Absent, as on the IC. No test here touches the network:
// `fetch` is stubbed wherever the agent would send a request.
import {
  Cbor,
  HttpFetchErrorCode,
  IC_ROOT_KEY,
  lookup_path,
  NodeType,
  TransportError,
  type HashTree,
  type HttpAgent,
  type KnownPath,
  type NodeHash,
  type NodeLabel,
  type NodeValue,
} from "@icp-sdk/core/agent"
import { Principal } from "@icp-sdk/core/principal"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { CandidCli } from "./compile.ts"
import { toHex } from "./hex.ts"
import { createInterfaceLoader } from "./loader.ts"
import {
  agentCandidSource,
  classifyReadError,
  createReadAgent,
  MAINNET_HOST,
  UnprovenPathError,
} from "./read-candid.ts"

const ICP_LEDGER = "ryjl3-tyaaa-aaaaa-aaaba-cai"
const LIFELINE = "rno2w-sqaaa-aaaaa-aaacq-cai"
const LOCAL_HOST = "http://127.0.0.1:4943"
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

// None of these loads gets as far as a compile.
const noCompiler: CandidCli = {
  didToContract: () => Promise.reject(new Error("no compile expected")),
  didToModule: () => Promise.reject(new Error("no compile expected")),
  projectDid: () => Promise.reject(new Error("no compile expected")),
  checkCompatible: () => Promise.reject(new Error("no compile expected")),
}

function loaderOver(tree: HashTree) {
  const { agent, query } = agentOver(tree)
  const loader = createInterfaceLoader({
    source: agentCandidSource(agent),
    cli: noCompiler,
  })
  return { loader, query }
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
      .catch((e: unknown) => e)
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

describe("classifyReadError", () => {
  it("reports a request the bounded fetch stopped as a timeout", () => {
    const stopped = TransportError.fromCode(
      new HttpFetchErrorCode(
        new DOMException(
          "The operation was aborted due to timeout",
          "TimeoutError"
        )
      )
    )
    expect(classifyReadError(stopped, "metadata")).toEqual({
      kind: "failed",
      code: "timeout",
      message: "The IC did not answer within 10 s.",
    })
  })
})

describe("createReadAgent", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /** Stubs `fetch` with `answer`, and returns the stub to inspect. */
  function stubFetch(answer: (url: string) => Promise<Response>) {
    const fetch = vi.fn((input: string | URL | Request, _init?: RequestInit) =>
      answer(String(input))
    )
    vi.stubGlobal("fetch", fetch)
    return fetch
  }

  it("checks certificates against mainnet's root key by default, and fetches nothing", async () => {
    const fetch = stubFetch(() => Promise.reject(new Error("no request")))
    const agent = await createReadAgent({
      host: MAINNET_HOST,
      fetchRootKey: false,
    })
    expect(toHex(agent.rootKey ?? new Uint8Array())).toBe(IC_ROOT_KEY)
    expect(fetch).not.toHaveBeenCalled()
  })

  it("uses the root key it is given, which wins over fetching one", async () => {
    const fetch = stubFetch(() => Promise.reject(new Error("no request")))
    const key = new Uint8Array(133).fill(3)
    const agent = await createReadAgent({
      host: LOCAL_HOST,
      rootKey: key,
      fetchRootKey: true,
    })
    expect(agent.rootKey).toBe(key)
    expect(fetch).not.toHaveBeenCalled()
  })

  it("fetches the root key from the host when asked, through the bounded fetch", async () => {
    const key = new Uint8Array(133).fill(9)
    const fetch = stubFetch(async () => {
      const body = Cbor.encode({ root_key: key })
      return new Response(new Uint8Array(body), { status: 200 })
    })
    const agent = await createReadAgent({
      host: LOCAL_HOST,
      fetchRootKey: true,
    })
    expect(toHex(agent.rootKey ?? new Uint8Array())).toBe(toHex(key))
    expect(fetch).toHaveBeenCalledOnce()
    const [url, init] = fetch.mock.calls[0] ?? []
    expect(String(url)).toBe(`${LOCAL_HOST}/api/v2/status`)
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })

  it("rejects, after one attempt, when the root key cannot be fetched", async () => {
    const fetch = stubFetch(() => Promise.reject(new TypeError("fetch failed")))
    await expect(
      createReadAgent({ host: LOCAL_HOST, fetchRootKey: true })
    ).rejects.toThrow(
      /^Fetching the root key from http:\/\/127\.0\.0\.1:4943 failed: /
    )
    expect(fetch).toHaveBeenCalledOnce()
  })

  it("sends a refused read_state once, not three times over", async () => {
    const fetch = stubFetch(
      async () =>
        new Response(
          "Custom section candid:service can only be requested by the controllers of the canister.",
          { status: 403, statusText: "Forbidden" }
        )
    )
    const agent = await createReadAgent({
      host: MAINNET_HOST,
      fetchRootKey: false,
    })
    const error: unknown = await agentCandidSource(agent)
      .readCandidAndHash(LIFELINE)
      .catch((e: unknown) => e)
    expect(classifyReadError(error, "metadata")).toEqual({ kind: "private" })
    expect(fetch).toHaveBeenCalledOnce()
    expect(String(fetch.mock.calls[0]?.[0])).toBe(
      `${MAINNET_HOST}/api/v3/canister/${LIFELINE}/read_state`
    )
  })
})
