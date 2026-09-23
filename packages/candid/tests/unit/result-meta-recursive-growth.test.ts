import { ClientManager } from "@ic-reactor/core"
import { HttpAgent } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { setFlagsFromString } from "node:v8"
import { runInNewContext } from "node:vm"
import { afterEach, describe, expect, it, vi } from "vitest"
import { MetadataDisplayReactor } from "../../src/metadata-display-reactor.js"
import { MetadataReactor } from "../../src/metadata-reactor.js"
import { ResultFieldVisitor } from "../../src/visitor/returns/index.js"
import type {
  RecordNode,
  RecursiveNode,
  VariantNode,
} from "../../src/visitor/returns/index.js"

/**
 * The result metadata builds the node for a recursive type lazily, when a
 * value first reaches it. It built one node per place a value reached, and kept
 * it: resolving a Motoko `List` of n elements built and kept n nested schema
 * levels, each with its own display codecs, in the reactor for as long as the
 * reactor lived. A binary tree kept a node for each of its nodes. Measured:
 * 7.6 MB kept after resolving one 2,000-element list, and 31 MB after one tree
 * of 8,191 nodes (about 3.9 kB per value node), none of it released when the
 * result was dropped.
 *
 * A node depends only on the type and the label it is met under, so one node
 * per (type, label) describes every occurrence, as a node per occurrence did.
 */

setFlagsFromString("--expose-gc")
const gc = runInNewContext("gc") as () => void

async function heapAfterGc(): Promise<number> {
  for (let i = 0; i < 3; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    gc()
  }
  return process.memoryUsage().heapUsed
}

function createMockClientManager(): ClientManager {
  const agent = HttpAgent.createSync({ host: "https://ic0.app" })
  return {
    agent,
    registerCanisterId: () => {},
    subscribe: () => () => {},
    queryClient: {
      invalidateQueries: () => Promise.resolve(),
      ensureQueryData: () => Promise.resolve(undefined),
      getQueryData: () => undefined,
    },
  } as unknown as ClientManager
}

/** Motoko's `List<Nat>`: `?(Nat, List<Nat>)`. */
const List = IDL.Rec()
List.fill(IDL.Opt(IDL.Tuple(IDL.Nat, List)))

const Tree = IDL.Rec()
Tree.fill(
  IDL.Variant({
    Leaf: IDL.Nat,
    Node: IDL.Record({ left: Tree, right: Tree }),
  })
)

type ListValue = [] | [[bigint, ListValue]]

function list(length: number): ListValue {
  let value: ListValue = []
  for (let i = length - 1; i >= 0; i--) value = [[BigInt(i), value]]
  return value
}

type TreeValue =
  { Leaf: bigint } | { Node: { left: TreeValue; right: TreeValue } }

function tree(depth: number): TreeValue {
  return depth === 0
    ? { Leaf: 1n }
    : { Node: { left: tree(depth - 1), right: tree(depth - 1) } }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe.each([
  ["MetadataDisplayReactor", MetadataDisplayReactor],
  ["MetadataReactor", MetadataReactor],
] as const)("%s result metadata for recursive values", (_name, Reactor) => {
  function createReactor() {
    return new Reactor({
      name: "lists",
      canisterId: "aaaaa-aa",
      clientManager: createMockClientManager(),
      idlFactory: ({ IDL: I }: { IDL: typeof IDL }) =>
        I.Service({
          list: I.Func([], [List], ["query"]),
          tree: I.Func([], [Tree], ["query"]),
        }),
    })
  }

  it("builds no more schema for a longer list", () => {
    const meta = createReactor().getOutputMeta("list")!
    const visitRec = vi.spyOn(ResultFieldVisitor.prototype, "visitRec")

    meta.resolve(list(5))
    const forFirstList = visitRec.mock.calls.length
    visitRec.mockClear()
    meta.resolve(list(500))

    // The first list met the nested occurrence once. 495 more elements are
    // described by the nodes that already exist.
    expect(forFirstList).toBeLessThanOrEqual(2)
    expect(visitRec).not.toHaveBeenCalled()
  })

  it("builds no more schema for a deeper tree", () => {
    const meta = createReactor().getOutputMeta("tree")!
    const visitRec = vi.spyOn(ResultFieldVisitor.prototype, "visitRec")

    meta.resolve(tree(1))
    visitRec.mockClear()
    meta.resolve(tree(9))

    expect(visitRec).not.toHaveBeenCalled()
  })

  it("keeps less than 2 MB after resolving a tree of 2,047 nodes", async () => {
    const reactor = createReactor()
    const meta = reactor.getOutputMeta("tree")!
    const value = tree(10)
    // V8 keeps what the first run of a code path saw, so that run is not the
    // one measured.
    meta.resolve(tree(1))

    const before = await heapAfterGc()
    // The result itself is not kept, so only what the reactor keeps is counted.
    expect(meta.resolve(value).results).toHaveLength(1)
    const after = await heapAfterGc()

    // Main kept about 8 MB here, in the reactor, after the result was gone.
    expect(after - before).toBeLessThan(2 * 1024 * 1024)
    expect(reactor.getOutputMeta("tree")).toBe(meta)
  })

  it("still labels each occurrence by the field it is met under", () => {
    const resolved = createReactor().getOutputMeta("tree")!.resolve(tree(2))
      .results[0] as RecursiveNode
    const node = (resolved.inner as VariantNode).selectedValue as RecordNode
    const left = node.fields.left as RecursiveNode
    const right = node.fields.right as RecursiveNode

    expect(resolved.label).toBe("__ret0")
    expect(left.label).toBe("left")
    expect(right.label).toBe("right")
    const leftNode = (left.inner as VariantNode).selectedValue as RecordNode
    expect(leftNode.fields.left.label).toBe("left")
    expect(leftNode.fields.right.label).toBe("right")
  })
})
