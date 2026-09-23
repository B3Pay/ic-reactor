import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient } from "@tanstack/query-core"
import { QueryResponseStatus } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { Principal } from "@icp-sdk/core/principal"
import { ClientManager } from "../src/client.js"
import { DisplayReactor } from "../src/display-reactor.js"
import { generateKey } from "../src/utils/helper.js"

/**
 * A DisplayReactor takes one Candid value in several forms, and the args
 * segment of the query key has to name the value that is sent, not the form:
 *
 * - A `vec record { text; T }` given as an object is sent as its entries, in
 *   the object's order, so two orders send different vectors. The key sorted
 *   the object's keys and gave both orders one cache entry (#761).
 * - An `opt` is taken bare, as `[value]`, or as `null`, `undefined` or `[]`
 *   for none, and a variant with or without its `_type`. Each form got a key
 *   of its own, so a value cached in one form called the canister again in
 *   another (#762).
 */

const CANISTER_ID = "ryjl3-tyaaa-aaaaa-aaaba-cai"
const OWNER = "aaaaa-aa"

const Account = IDL.Record({
  owner: IDL.Principal,
  subaccount: IDL.Opt(IDL.Vec(IDL.Nat8)),
})
const Filter = IDL.Variant({
  All: IDL.Null,
  ByOwner: IDL.Principal,
  ByMemo: IDL.Opt(IDL.Text),
  Since: IDL.Nat64,
})

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({
    // Maps: a `vec record { text; T }`, which the codec also takes as an object.
    scores: IDL.Func(
      [IDL.Vec(IDL.Tuple(IDL.Text, IDL.Nat))],
      [IDL.Nat],
      ["query"]
    ),
    limits: IDL.Func(
      [IDL.Vec(IDL.Tuple(IDL.Text, IDL.Opt(IDL.Nat)))],
      [IDL.Nat],
      ["query"]
    ),
    page: IDL.Func([IDL.Opt(IDL.Nat)], [IDL.Nat], ["query"]),
    tags: IDL.Func([IDL.Opt(IDL.Vec(IDL.Text))], [IDL.Nat], ["query"]),
    nested: IDL.Func([IDL.Opt(IDL.Opt(IDL.Nat))], [IDL.Nat], ["query"]),
    search: IDL.Func([Filter], [IDL.Nat], ["query"]),
    history: IDL.Func(
      [
        IDL.Record({
          account: Account,
          start: IDL.Opt(IDL.Nat),
          filter: IDL.Opt(Filter),
        }),
      ],
      [IDL.Nat],
      ["query"]
    ),
  })

let queryClient: QueryClient
let clientManager: ClientManager
/** The Candid argument bytes of each query the agent was asked to send. */
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
    sent.push(Array.from(arg).join(","))
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

const keyOf = (reactor: Reactor, functionName: string, args: unknown[]) =>
  reactor.generateQueryKey({
    functionName: functionName as never,
    args: args as never,
  })

/** The args segment: the last element of a key built with args. */
const argsSegment = (reactor: Reactor, fn: string, args: unknown[]) => {
  const key = keyOf(reactor, fn, args)
  return key[key.length - 1]
}

/** The distinct keys among `forms`, each passed as the only argument. */
const distinctKeys = (reactor: Reactor, fn: string, forms: unknown[]) =>
  new Set(forms.map((form) => JSON.stringify(keyOf(reactor, fn, [form]))))

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

describe("a map given as an object (#761)", () => {
  it("gets a key for each order of its entries, which send different vectors", async () => {
    const reactor = makeReactor()
    const ab = { a: "1", b: "2" }
    const ba = { b: "2", a: "1" }

    const [sentAb, sentBa] = await sentBy(reactor, "scores", [ab, ba])
    expect(sentAb).not.toBe(sentBa)
    expect(distinctKeys(reactor, "scores", [ab, ba]).size).toBe(2)
  })

  it("does not answer one order from the other's cache entry", async () => {
    const reactor = makeReactor()
    expect(
      await fetchEach(reactor, "scores", [
        { a: "1", b: "2" },
        { b: "2", a: "1" },
      ])
    ).toEqual(["1", "2"])
    expect(sent).toHaveLength(2)
  })

  it("gets one key for one order, as an object or as the pairs it sends", async () => {
    const reactor = makeReactor()
    const forms = [
      { b: "2", a: "1" },
      { b: "2", a: "1" },
      [
        ["b", "2"],
        ["a", "1"],
      ],
    ]
    expect(new Set(await sentBy(reactor, "scores", forms)).size).toBe(1)
    expect(distinctKeys(reactor, "scores", forms).size).toBe(1)

    // JavaScript puts integer-like keys first, in numeric order, in both
    // objects, and the codec sends the entries in that order.
    const numeric = [
      { b: "1", 10: "2" },
      { 10: "2", b: "1" },
      [
        ["10", "2"],
        ["b", "1"],
      ],
    ]
    expect(new Set(await sentBy(reactor, "scores", numeric)).size).toBe(1)
    expect(distinctKeys(reactor, "scores", numeric).size).toBe(1)
  })

  it("keeps an entry whose value is none apart from no entry", async () => {
    const reactor = makeReactor()
    // `{ a: undefined }` sends the entry ("a", none). JSON leaves the key out,
    // so it had the empty map's key.
    const [entry, empty] = await sentBy(reactor, "limits", [
      { a: undefined },
      {},
    ])
    expect(entry).not.toBe(empty)
    expect(distinctKeys(reactor, "limits", [{ a: undefined }, {}]).size).toBe(2)

    const nones = [
      { a: undefined },
      { a: null },
      { a: [] },
      [["a", null]],
      [["a", []]],
    ]
    expect(new Set(await sentBy(reactor, "limits", nones)).size).toBe(1)
    expect(distinctKeys(reactor, "limits", nones).size).toBe(1)
  })

  it("still keys a record the same whatever the order of its fields", () => {
    const reactor = makeReactor()
    expect(
      distinctKeys(reactor, "history", [
        {
          account: { owner: OWNER, subaccount: "0a" },
          start: "5",
          filter: { _type: "All" },
        },
        {
          filter: { _type: "All" },
          start: "5",
          account: { subaccount: "0a", owner: OWNER },
        },
      ]).size
    ).toBe(1)
  })
})

describe("an opt or a variant in another form (#762)", () => {
  it("gets one key for an opt given bare or wrapped", () => {
    const reactor = makeReactor()
    expect(distinctKeys(reactor, "page", ["5", ["5"]]).size).toBe(1)
    // A bare one-element vector, and the wrapper around it.
    expect(distinctKeys(reactor, "tags", [["a"], [["a"]]]).size).toBe(1)
    // An opt blob: #757 gave the bare and the wrapped forms a key each.
    const accounts = [
      "0a",
      ["0a"],
      new Uint8Array([10]),
      [new Uint8Array([10])],
    ].map((subaccount) => ({ account: { owner: OWNER, subaccount } }))
    expect(distinctKeys(reactor, "history", accounts).size).toBe(1)
  })

  it("gets one key for none in every form, an absent field included", () => {
    const reactor = makeReactor()
    expect(distinctKeys(reactor, "page", [undefined, null, []]).size).toBe(1)

    const account = { owner: OWNER }
    expect(
      distinctKeys(reactor, "history", [
        { account },
        { account, start: undefined },
        { account, start: null },
        { account, start: [] },
        { account: { owner: OWNER, subaccount: null }, filter: [] },
      ]).size
    ).toBe(1)
  })

  it("gets one key for a variant with or without its _type", () => {
    const reactor = makeReactor()
    const values = [
      [{ _type: "ByOwner", ByOwner: OWNER }, { ByOwner: OWNER }],
      // A null arm, whose payload the codec never sends.
      [{ _type: "All" }, { All: null }, { _type: "All", All: null }],
      // An opt arm's none, and a value.
      [
        { _type: "ByMemo" },
        { ByMemo: null },
        { ByMemo: [] },
        { _type: "ByMemo", ByMemo: undefined },
      ],
      [{ _type: "ByMemo", ByMemo: "x" }, { ByMemo: "x" }, { ByMemo: ["x"] }],
    ]
    for (const forms of values) {
      expect(distinctKeys(reactor, "search", forms).size).toBe(1)
    }
    expect(
      distinctKeys(
        reactor,
        "search",
        values.map(([form]) => form)
      ).size
    ).toBe(values.length)
  })

  it("calls the canister once for all the forms of one value, which send the same bytes", async () => {
    const reactor = makeReactor()
    const forms = [
      {
        account: { owner: OWNER },
        start: "5",
        filter: { _type: "ByMemo", ByMemo: "x" },
      },
      {
        account: { owner: OWNER, subaccount: null },
        start: ["5"],
        filter: [{ ByMemo: ["x"] }],
      },
      {
        account: { owner: OWNER, subaccount: [] },
        start: ["5"],
        filter: { ByMemo: "x" },
      },
    ]
    expect(await fetchEach(reactor, "history", forms)).toEqual(["1", "1", "1"])
    expect(sent).toHaveLength(1)

    expect(new Set(await sentBy(reactor, "history", forms)).size).toBe(1)
  })

  it("keeps none, some(none) and a value of a nested opt apart", () => {
    const reactor = makeReactor()
    // Some(none) is written with the wrapper, and its key keeps it.
    const none = [undefined, null, []]
    const someNone = [[null], [[]], [undefined]]
    const someFive = ["5", ["5"], [["5"]]]
    for (const forms of [none, someNone, someFive]) {
      expect(distinctKeys(reactor, "nested", forms).size).toBe(1)
    }
    expect(
      distinctKeys(reactor, "nested", [none[0], someNone[0], someFive[0]]).size
    ).toBe(3)
  })

  it("keeps the arms of a variant without _type apart when the payload is undefined", async () => {
    const reactor = makeReactor()
    // `{ All: undefined }` sends All, and `{ ByMemo: undefined }` sends
    // ByMemo with none. JSON leaves out the one key each has, so both were `{}`.
    const forms = [{ All: undefined }, { ByMemo: undefined }]
    expect(await fetchEach(reactor, "search", forms)).toEqual(["1", "2"])
    const [all, byMemo] = sent
    expect(all).not.toBe(byMemo)
  })

  it("keeps distinct values distinct", () => {
    const reactor = makeReactor()
    expect(
      distinctKeys(reactor, "page", [undefined, "0", "5", "50"]).size
    ).toBe(4)
    expect(
      distinctKeys(reactor, "tags", [
        undefined,
        [[]],
        ["a"],
        ["a", "b"],
        ["b", "a"],
      ]).size
    ).toBe(5)
    expect(
      distinctKeys(reactor, "search", [
        { _type: "All" },
        { _type: "ByOwner", ByOwner: OWNER },
        { _type: "ByMemo" },
        { _type: "ByMemo", ByMemo: "" },
        { _type: "Since", Since: "0" },
      ]).size
    ).toBe(5)
  })
})

describe("the key of args in the forms the codecs return", () => {
  it("is byte-identical to the key before", () => {
    const reactor = makeReactor()
    const calls: Array<[string, unknown[]]> = [
      ["page", ["5"]],
      ["page", [undefined]],
      ["tags", [["a", "b"]]],
      // A nested opt keeps its wrapper.
      ["nested", [["5"]]],
      ["search", [{ _type: "All" }]],
      ["search", [{ _type: "ByMemo", ByMemo: "x" }]],
      [
        "scores",
        [
          [
            ["b", "2"],
            ["a", "1"],
          ],
        ],
      ],
      [
        "limits",
        [
          [
            ["a", undefined],
            ["b", "1"],
          ],
        ],
      ],
      [
        "history",
        [
          {
            account: { owner: OWNER },
            start: "5",
            filter: { _type: "ByOwner", ByOwner: OWNER },
          },
        ],
      ],
      [
        "history",
        [
          {
            account: { owner: OWNER, subaccount: undefined },
            filter: undefined,
          },
        ],
      ],
    ]
    for (const [fn, args] of calls) {
      expect(argsSegment(reactor, fn, args)).toBe(generateKey(args))
    }
  })
})
