import { runInNewContext } from "node:vm"
import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient } from "@tanstack/query-core"
import { QueryResponseStatus } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { Principal } from "@icp-sdk/core/principal"
import { ClientManager } from "../src/client.js"
import { DisplayReactor } from "../src/display-reactor.js"
import { didToDisplayCodec } from "../src/display/index.js"

/**
 * A DisplayReactor takes a `vec record { text; T }` as an object keyed by the
 * text, and its codec sent `Object.entries` of any object that is not an
 * array. `Object.entries` of a JavaScript `Map` is `[]`, so a Map was sent as
 * an empty vector: the canister got none of its entries, and nothing failed
 * (#767). Its query key was that of the empty map too, since the JSON of a
 * Map is `{}`.
 *
 * `DisplayOf` types the argument as `Record<string, T>`, so only a value that
 * reaches the reactor untyped is a Map: a cast, a form library, or state that
 * keeps its maps as Maps.
 */

const CANISTER_ID = "ryjl3-tyaaa-aaaaa-aaaba-cai"

const Scores = IDL.Vec(IDL.Tuple(IDL.Text, IDL.Nat))
const Limits = IDL.Vec(IDL.Tuple(IDL.Text, IDL.Opt(IDL.Nat)))

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({
    scores: IDL.Func([Scores], [IDL.Nat], ["query"]),
    limits: IDL.Func([Limits], [IDL.Nat], ["query"]),
    // The map as a field, and as an optional.
    profile: IDL.Func(
      [IDL.Record({ name: IDL.Text, tags: IDL.Opt(Scores) })],
      [IDL.Nat],
      ["query"]
    ),
  })

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")

let queryClient: QueryClient
let clientManager: ClientManager
/** The hex of the Candid argument of each query the agent was asked to send. */
let sent: string[]

beforeEach(() => {
  // No retries: a call that fails should fail at once.
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  clientManager = new ClientManager({
    queryClient,
    agentOptions: { host: "https://icp-api.io" },
  })
  sent = []
  // Each reply is the number of calls so far.
  vi.spyOn(clientManager.agent, "query").mockImplementation((async (
    _canisterId: Principal,
    { arg }: { arg: Uint8Array }
  ) => {
    sent.push(hex(arg))
    return {
      status: QueryResponseStatus.Replied,
      reply: { arg: IDL.encode([IDL.Nat], [BigInt(sent.length)]) },
    }
  }) as never)
})

const makeReactor = () =>
  new DisplayReactor({
    clientManager,
    name: "display",
    canisterId: CANISTER_ID,
    idlFactory,
  })

type Reactor = ReturnType<typeof makeReactor>

/** The distinct keys among `forms`, each passed as the only argument. */
const distinctKeys = (reactor: Reactor, fn: string, forms: unknown[]) =>
  new Set(
    forms.map((form) =>
      JSON.stringify(
        reactor.generateQueryKey({
          functionName: fn as never,
          args: [form] as never,
        })
      )
    )
  )

/** The bytes each form sends, one call each. */
const sentBy = async (reactor: Reactor, fn: string, forms: unknown[]) => {
  const before = sent.length
  for (const form of forms) {
    await reactor.callMethod({
      functionName: fn as never,
      args: [form] as never,
    })
  }
  return sent.slice(before)
}

/** What `fetchQuery` returns for each form, in turn. */
const fetchEach = async (reactor: Reactor, fn: string, forms: unknown[]) => {
  const results: unknown[] = []
  for (const form of forms) {
    results.push(
      await reactor.fetchQuery({
        functionName: fn as never,
        args: [form] as never,
      })
    )
  }
  return results
}

describe("a Map given for a DisplayReactor's map (#767)", () => {
  it("is sent with its entries, not as an empty vector", async () => {
    const reactor = makeReactor()
    const [map] = await sentBy(reactor, "scores", [new Map([["a", "1"]])])

    // The bytes the issue measured for `{ a: "1" }`, and not those of `{}`,
    // 4449444c026c020071017d6d00010100.
    expect(map).toBe("4449444c026c020071017d6d00010101016101")
    expect(map).toBe(hex(IDL.encode([Scores], [[["a", 1n]]])))
  })

  it("is encoded by the codec as its entries in insertion order", () => {
    const codec = didToDisplayCodec(Scores)

    expect(codec.asCandid(new Map([["a", "1"]]) as never)).toEqual([["a", 1n]])
    // A Map keeps its insertion order, an integer-like key included, which
    // an object would move to the front.
    expect(
      codec.asCandid(
        new Map([
          ["b", "1"],
          ["10", "2"],
        ]) as never
      )
    ).toEqual([
      ["b", 1n],
      ["10", 2n],
    ])
  })

  it("is sent with its entries from another realm too", async () => {
    const reactor = makeReactor()
    const foreign = runInNewContext('new Map([["a", "1"]])') as object

    expect(foreign).not.toBeInstanceOf(Map)
    expect(await sentBy(reactor, "scores", [foreign])).toEqual([
      hex(IDL.encode([Scores], [[["a", 1n]]])),
    ])
  })

  it("is sent with its entries as a field and as an optional", async () => {
    const reactor = makeReactor()
    const [sentMap, sentObject] = await sentBy(reactor, "profile", [
      { name: "x", tags: new Map([["a", "1"]]) },
      { name: "x", tags: { a: "1" } },
    ])
    expect(sentMap).toBe(sentObject)

    // An entry whose value is none is still an entry.
    const [noneEntry, empty] = await sentBy(reactor, "limits", [
      new Map([["a", undefined]]),
      {},
    ])
    expect(noneEntry).toBe(hex(IDL.encode([Limits], [[["a", []]]])))
    expect(noneEntry).not.toBe(empty)
  })

  it("is refused when a key is not text, instead of sent as an empty vector", async () => {
    const reactor = makeReactor()

    await expect(
      reactor.callMethod({
        functionName: "scores",
        args: [new Map([[1, "2"]])] as never,
      })
    ).rejects.toThrow(/Could not convert the argument/)
    expect(sent).toEqual([])
  })

  it("gets the key of the object or the pairs that send the same bytes", async () => {
    const reactor = makeReactor()
    const forms = [
      new Map([
        ["b", "2"],
        ["a", "1"],
      ]),
      { b: "2", a: "1" },
      [
        ["b", "2"],
        ["a", "1"],
      ],
    ]
    expect(new Set(await sentBy(reactor, "scores", forms)).size).toBe(1)
    expect(distinctKeys(reactor, "scores", forms).size).toBe(1)

    // A Map that puts an integer-like key last sends what no object can, and
    // shares its key only with the pairs in that order.
    const numericLast = [
      new Map([
        ["b", "1"],
        ["10", "2"],
      ]),
      [
        ["b", "1"],
        ["10", "2"],
      ],
    ]
    expect(new Set(await sentBy(reactor, "scores", numericLast)).size).toBe(1)
    expect(distinctKeys(reactor, "scores", numericLast).size).toBe(1)
    expect(
      distinctKeys(reactor, "scores", [numericLast[0], { b: "1", 10: "2" }])
        .size
    ).toBe(2)
  })

  it("is not answered from the empty map's cache entry", async () => {
    const reactor = makeReactor()
    expect(
      await fetchEach(reactor, "scores", [{}, new Map([["a", "1"]])])
    ).toEqual(["1", "2"])
    expect(sent).toHaveLength(2)
    expect(sent[1]).toBe(hex(IDL.encode([Scores], [[["a", 1n]]])))
  })

  it("with a key that is not text is not answered from the cache of the map it spells", async () => {
    const reactor = makeReactor()
    await reactor.fetchQuery({
      functionName: "scores",
      args: [{ 1: "2" }] as never,
    })
    expect(sent).toHaveLength(1)

    await expect(
      reactor.fetchQuery({
        functionName: "scores",
        args: [new Map([[1, "2"]])] as never,
      })
    ).rejects.toThrow()
    expect(sent).toHaveLength(1)
  })

  it("keeps two orders of one Map apart", async () => {
    const reactor = makeReactor()
    const ab = new Map([
      ["a", "1"],
      ["b", "2"],
    ])
    const ba = new Map([
      ["b", "2"],
      ["a", "1"],
    ])
    expect(await fetchEach(reactor, "scores", [ab, ba])).toEqual(["1", "2"])
    expect(sent[0]).not.toBe(sent[1])
  })
})
