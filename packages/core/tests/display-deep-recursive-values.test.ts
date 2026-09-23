import { describe, it, expect, vi, afterEach } from "vitest"
import { QueryClient } from "@tanstack/query-core"
import { IDL } from "@icp-sdk/core/candid"
import { ClientManager } from "../src/client.js"
import { DisplayReactor } from "../src/display-reactor.js"
import { didToDisplayCodec } from "../src/display/index.js"

/**
 * Every display codec is a zod codec, and a compound codec called its
 * children through `codec.decode()` / `codec.encode()`, which enters zod's
 * parse pipeline: about five stack frames and a parse context per child, on
 * top of the codec's own. A Motoko `List<Nat>` is three codecs per element
 * (opt, tuple, rec), so the codec ran out of stack at 586 elements (583 when
 * encoding), where IDL.decode decodes about 1,400 and IDL.encode 1,250. A
 * DisplayReactor then logged the RangeError and returned the raw Candid
 * value, bigints included, in place of the display value.
 */

/** Motoko's `List<Nat>`: `?(Nat, List<Nat>)`. */
const List = IDL.Rec()
List.fill(IDL.Opt(IDL.Tuple(IDL.Nat, List)))

type CandidList = [] | [[bigint, CandidList]]
type DisplayList = undefined | [string, DisplayList]

/** 0, 1, ..., length - 1 in Candid form, built without recursion. */
function candidList(length: number): CandidList {
  let list: CandidList = []
  for (let i = length - 1; i >= 0; i--) list = [[BigInt(i), list]]
  return list
}

/** The same list in display form: an optional displays as its value. */
function displayList(length: number): DisplayList {
  let list: DisplayList = undefined
  for (let i = length - 1; i >= 0; i--) list = [String(i), list]
  return list
}

/** The heads of a display list, read without recursion. */
function displayHeads(list: DisplayList): unknown[] {
  const heads: unknown[] = []
  for (let node = list; node !== undefined; node = node[1]) heads.push(node[0])
  return heads
}

/** The heads of a Candid list, read without recursion. */
function candidHeads(list: CandidList): unknown[] {
  const heads: unknown[] = []
  for (let node = list; node.length === 1; node = node[0][1]) {
    heads.push(node[0][0])
  }
  return heads
}

const LENGTH = 800
const expectedHeads = Array.from({ length: LENGTH }, (_, i) => String(i))

afterEach(() => {
  vi.restoreAllMocks()
})

describe("display codecs on deeply nested values", () => {
  it(`display a Motoko List of ${LENGTH} elements`, () => {
    const codec = didToDisplayCodec(List)
    const displayed = codec.asDisplay(candidList(LENGTH)) as DisplayList

    expect(displayHeads(displayed)).toEqual(expectedHeads)
  })

  it(`encode a displayed Motoko List of ${LENGTH} elements`, () => {
    const codec = didToDisplayCodec(List)
    const encoded = codec.asCandid(displayList(LENGTH)) as CandidList

    expect(candidHeads(encoded)).toEqual(
      expectedHeads.map((head) => BigInt(head))
    )
  })

  it(`return display values from DisplayReactor for a List of ${LENGTH}`, async () => {
    const reactor = new DisplayReactor({
      clientManager: new ClientManager({
        queryClient: new QueryClient(),
        agentOptions: { host: "https://icp-api.io" },
      }),
      name: "lists",
      canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
      idlFactory: ({ IDL: I }) =>
        I.Service({ list: I.Func([], [List], ["query"]) }),
    })
    vi.spyOn(reactor as any, "executeQuery").mockResolvedValue(
      IDL.encode([List], [candidList(LENGTH)])
    )
    const logged = vi.spyOn(console, "error").mockImplementation(() => {})

    const result = await reactor.callMethod({ functionName: "list" })

    // Main logged the RangeError and returned the Candid value: 0n, not "0".
    expect(logged).not.toHaveBeenCalled()
    expect(displayHeads(result as DisplayList)).toEqual(expectedHeads)
  })
})
