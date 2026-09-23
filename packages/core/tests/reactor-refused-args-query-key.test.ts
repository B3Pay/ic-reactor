import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient } from "@tanstack/query-core"
import { QueryResponseStatus } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { Principal } from "@icp-sdk/core/principal"
import { ClientManager } from "../src/client.js"
import { Reactor } from "../src/reactor.js"
import { DisplayReactor } from "../src/display-reactor.js"
import { generateKey } from "../src/utils/helper.js"

/**
 * The args segment of a query key is the JSON of the arguments, and JSON
 * writes some values a reactor refuses exactly as it writes values the
 * reactor takes (#765):
 *
 * - `undefined` where Candid `null` is required: JSON writes it as `null`.
 * - A bigint, which the key writes as its decimal text (#515): the key of
 *   that text for a `text`, and for a DisplayReactor's numbers, whose codecs
 *   take text and refuse a bigint.
 * - Text for a Reactor's integer: the key of the bigint it spells.
 * - `{ __principal__: "..." }`, which is what JSON.parse returns for a
 *   Principal: the key of the Principal.
 * - A Reactor's variant with an `undefined` beside its arm: JSON leaves the
 *   `undefined` out, and IDL.encode refuses a variant with two keys.
 *
 * With the valid call cached, the refused one was answered from the cache by
 * `fetchQuery` or a query hook instead of failing.
 *
 * Some forms that send the same bytes also got keys of their own: text for a
 * DisplayReactor's small integer or float, a Principal for its text, fields a
 * record does not declare, and values of `reserved`.
 */

const CANISTER_ID = "ryjl3-tyaaa-aaaaa-aaaba-cai"
const OWNER_TEXT = "aaaaa-aa"
const OWNER = Principal.fromText(OWNER_TEXT)

const Account = IDL.Record({
  owner: IDL.Principal,
  subaccount: IDL.Opt(IDL.Vec(IDL.Nat8)),
})
const Filter = IDL.Variant({
  All: IDL.Null,
  ByOwner: IDL.Principal,
  ByMemo: IDL.Opt(IDL.Text),
})

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({
    ping: IDL.Func([IDL.Null], [IDL.Nat], ["query"]),
    stats: IDL.Func([IDL.Record({})], [IDL.Nat], ["query"]),
    greet: IDL.Func([IDL.Text], [IDL.Nat], ["query"]),
    balance: IDL.Func([IDL.Nat], [IDL.Nat], ["query"]),
    page: IDL.Func([IDL.Nat32], [IDL.Nat], ["query"]),
    offset: IDL.Func([IDL.Int32], [IDL.Nat], ["query"]),
    ratio: IDL.Func([IDL.Float64], [IDL.Nat], ["query"]),
    owner_of: IDL.Func([IDL.Principal], [IDL.Nat], ["query"]),
    balance_of: IDL.Func([Account], [IDL.Nat], ["query"]),
    search: IDL.Func([Filter], [IDL.Nat], ["query"]),
    scores: IDL.Func(
      [IDL.Vec(IDL.Tuple(IDL.Text, IDL.Nat))],
      [IDL.Nat],
      ["query"]
    ),
    // `reserved` stands for a field or an arm an interface has retired.
    legacy: IDL.Func(
      [IDL.Record({ id: IDL.Nat, old: IDL.Reserved })],
      [IDL.Nat],
      ["query"]
    ),
    pick: IDL.Func(
      [IDL.Variant({ A: IDL.Reserved, B: IDL.Reserved })],
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

type Kind = "Reactor" | "DisplayReactor"

const makeReactor = (kind: Kind) =>
  new (kind === "Reactor" ? Reactor : DisplayReactor)({
    clientManager,
    name: kind,
    canisterId: CANISTER_ID,
    idlFactory,
  })

type AnyReactor = ReturnType<typeof makeReactor>

const keyOf = (reactor: AnyReactor, functionName: string, args: unknown[]) =>
  reactor.generateQueryKey({
    functionName: functionName as never,
    args: args as never,
  })

/** The args segment: the last element of a key built with args. */
const argsSegment = (reactor: AnyReactor, fn: string, args: unknown[]) => {
  const key = keyOf(reactor, fn, args)
  return key[key.length - 1]
}

/** The distinct keys among `forms`, each passed as the only argument. */
const distinctKeys = (reactor: AnyReactor, fn: string, forms: unknown[]) =>
  new Set(forms.map((form) => JSON.stringify(keyOf(reactor, fn, [form]))))

/** The bytes each form sends, one call each. */
const sentBy = async (reactor: AnyReactor, fn: string, forms: unknown[]) => {
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
const fetchEach = async (reactor: AnyReactor, fn: string, forms: unknown[]) => {
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

/** A record without Object.prototype, as `Object.create(null)` makes. */
const bare = (fields: object) => Object.assign(Object.create(null), fields)

// [what is refused, reactor, method, a valid argument, the refused one]
const REFUSED: Array<[string, Kind, string, unknown, unknown]> = [
  ["undefined for null", "Reactor", "ping", null, undefined],
  ["undefined for null", "DisplayReactor", "ping", null, undefined],
  // IDL.encode takes `null` for a record without fields, but not `undefined`.
  ["undefined for an empty record", "Reactor", "stats", null, undefined],
  ["undefined for an empty record", "DisplayReactor", "stats", null, undefined],
  ["a bigint for text", "Reactor", "greet", "10", 10n],
  ["a bigint for text", "DisplayReactor", "greet", "10", 10n],
  ["text for a nat", "Reactor", "balance", 10n, "10"],
  ["a bigint for a nat", "DisplayReactor", "balance", "10", 10n],
  ["a bigint for a nat32", "DisplayReactor", "page", "10", 10n],
  ["a bigint for a float64", "DisplayReactor", "ratio", "10", 10n],
  [
    "a parsed Principal for a principal",
    "Reactor",
    "owner_of",
    OWNER,
    JSON.parse(JSON.stringify(OWNER)),
  ],
  [
    "a parsed Principal for a principal",
    "DisplayReactor",
    "owner_of",
    OWNER,
    JSON.parse(JSON.stringify(OWNER)),
  ],
  [
    "a variant with an undefined beside its arm",
    "Reactor",
    "search",
    { All: null },
    { All: null, ByMemo: undefined },
  ],
  [
    "a record without Object.prototype",
    "Reactor",
    "balance_of",
    { owner: OWNER, subaccount: [] },
    bare({ owner: OWNER, subaccount: [] }),
  ],
  [
    "a record without its reserved field",
    "Reactor",
    "legacy",
    { id: 1n, old: undefined },
    { id: 1n },
  ],
  // The map codec takes any object that is not an array as its entries: a
  // Date has none. It refuses the Date's text, whose JSON is the Date's.
  [
    "the text of a Date for a map",
    "DisplayReactor",
    "scores",
    new Date(0),
    new Date(0).toJSON(),
  ],
]

describe("a refused argument (#765)", () => {
  it.each(REFUSED)(
    "%s in a %s is not answered from the valid call's cache entry",
    async (_what, kind, fn, valid, refused) => {
      const reactor = makeReactor(kind)
      // The premise: the reactor takes one and refuses the other.
      await expect(
        reactor.callMethod({
          functionName: fn as never,
          args: [refused] as never,
        })
      ).rejects.toThrow()
      expect(sent).toHaveLength(0)

      await reactor.fetchQuery({
        functionName: fn as never,
        args: [valid] as never,
      })
      expect(sent).toHaveLength(1)

      await expect(
        reactor.fetchQuery({
          functionName: fn as never,
          args: [refused] as never,
        })
      ).rejects.toThrow()
      expect(distinctKeys(reactor, fn, [valid, refused]).size).toBe(2)
    }
  )

  it("keeps apart two arms of a Reactor's variant whose payload is reserved", async () => {
    // `{ A: undefined }` and `{ B: undefined }` send different arms. JSON
    // leaves out the one key each has, so both were `{}`, and the second
    // call was answered with the first one's result.
    const reactor = makeReactor("Reactor")
    expect(
      await fetchEach(reactor, "pick", [{ A: undefined }, { B: undefined }])
    ).toEqual([1n, 2n])
    expect(new Set(sent).size).toBe(2)
  })

  it("writes a refused value behind a tag no argument can spell", () => {
    for (const kind of ["Reactor", "DisplayReactor"] as const) {
      const reactor = makeReactor(kind)
      const [tag] = JSON.parse(
        argsSegment(reactor, "greet", [10n]) as string
      ) as [string]
      expect(tag.startsWith("\u0000refused:")).toBe(true)
      // The same text, given where text is taken, keeps a key of its own.
      expect(distinctKeys(reactor, "greet", [10n, tag]).size).toBe(2)
    }
  })
})

describe("forms of one value, which send the same bytes (#765)", () => {
  it("gets one key for a DisplayReactor's small integer as a number or as text", async () => {
    const reactor = makeReactor("DisplayReactor")
    for (const [fn, forms] of [
      ["page", [10, "10", "010"]],
      // The codec sends 0 for -0 and for "-0".
      ["offset", [0, -0, "0", "-0", "00"]],
    ] as const) {
      expect(new Set(await sentBy(reactor, fn, [...forms])).size).toBe(1)
      expect(distinctKeys(reactor, fn, [...forms]).size).toBe(1)
    }
  })

  it("gets one key for a DisplayReactor's float as a number or as text", async () => {
    const reactor = makeReactor("DisplayReactor")
    const forms = [1.5, "1.5", " 1.5 ", "15e-1"]
    expect(new Set(await sentBy(reactor, "ratio", forms)).size).toBe(1)
    expect(distinctKeys(reactor, "ratio", forms).size).toBe(1)
    // A float sends -0 as -0, so it stays apart from 0.
    expect(new Set(await sentBy(reactor, "ratio", [-0, "-0"])).size).toBe(1)
    expect(distinctKeys(reactor, "ratio", [-0, "-0"]).size).toBe(1)
    expect(distinctKeys(reactor, "ratio", [-0, 0]).size).toBe(2)
  })

  it("gets one key for a principal as a Principal or as its text", async () => {
    const reactor = makeReactor("DisplayReactor")
    expect(await fetchEach(reactor, "owner_of", [OWNER, OWNER_TEXT])).toEqual([
      "1",
      "1",
    ])
    expect(sent).toHaveLength(1)

    const accounts = [{ owner: OWNER }, { owner: OWNER_TEXT }]
    expect(new Set(await sentBy(reactor, "balance_of", accounts)).size).toBe(1)
    expect(distinctKeys(reactor, "balance_of", accounts).size).toBe(1)
  })

  it("leaves out the fields a record does not declare", async () => {
    for (const [kind, account] of [
      ["Reactor", { owner: OWNER, subaccount: [] }],
      ["DisplayReactor", { owner: OWNER_TEXT }],
    ] as const) {
      const reactor = makeReactor(kind)
      const forms = [account, { ...account, label: "savings" }]
      expect(new Set(await sentBy(reactor, "balance_of", forms)).size).toBe(1)
      expect(distinctKeys(reactor, "balance_of", forms).size).toBe(1)
    }
  })

  it("gets one key for every value of reserved", async () => {
    const reactor = makeReactor("Reactor")
    const records = [
      { id: 1n, old: null },
      { id: 1n, old: 5 },
      { id: 1n, old: undefined },
    ]
    expect(new Set(await sentBy(reactor, "legacy", records)).size).toBe(1)
    expect(distinctKeys(reactor, "legacy", records).size).toBe(1)
    expect(
      distinctKeys(reactor, "pick", [{ A: null }, { A: 5 }, { A: undefined }])
        .size
    ).toBe(1)

    // The record codec also takes the field absent.
    const display = makeReactor("DisplayReactor")
    const forms = [{ id: "1", old: null }, { id: "1", old: "x" }, { id: "1" }]
    expect(new Set(await sentBy(display, "legacy", forms)).size).toBe(1)
    expect(distinctKeys(display, "legacy", forms).size).toBe(1)
    expect(
      distinctKeys(display, "pick", [{ _type: "A" }, { A: 5 }, { A: null }])
        .size
    ).toBe(1)
  })

  it("keeps distinct values distinct", () => {
    const display = makeReactor("DisplayReactor")
    expect(distinctKeys(display, "page", [10, "11", "100"]).size).toBe(3)
    expect(distinctKeys(display, "ratio", [1.5, "1.25", "-1.5"]).size).toBe(3)
    expect(
      distinctKeys(display, "owner_of", [OWNER, CANISTER_ID, "2vxsx-fae"]).size
    ).toBe(3)
    expect(
      distinctKeys(display, "legacy", [{ id: "1" }, { id: "2", old: null }])
        .size
    ).toBe(2)

    const reactor = makeReactor("Reactor")
    for (const label of [undefined, "savings"]) {
      expect(
        distinctKeys(
          reactor,
          "balance_of",
          [
            { owner: OWNER, subaccount: [] },
            { owner: Principal.fromText(CANISTER_ID), subaccount: [] },
            { owner: OWNER, subaccount: [[1]] },
          ].map((account) => (label ? { ...account, label } : account))
        ).size
      ).toBe(3)
    }
    expect(distinctKeys(reactor, "pick", [{ A: null }, { B: null }]).size).toBe(
      2
    )
  })
})

describe("the key of an argument in the forms the codecs return", () => {
  it("is byte-identical to the key before", () => {
    const calls: Array<[Kind, string, unknown[]]> = [
      ["Reactor", "ping", [null]],
      ["Reactor", "greet", ["10"]],
      ["Reactor", "balance", [10n]],
      ["Reactor", "page", [10]],
      ["Reactor", "offset", [-5]],
      ["Reactor", "ratio", [-0]],
      ["Reactor", "owner_of", [OWNER]],
      ["Reactor", "balance_of", [{ owner: OWNER, subaccount: [] }]],
      ["Reactor", "search", [{ ByMemo: ["x"] }]],
      ["Reactor", "search", [{ ByOwner: OWNER }]],
      ["Reactor", "scores", [[["a", 1n]]]],
      ["Reactor", "legacy", [{ id: 1n, old: null }]],
      ["Reactor", "pick", [{ B: null }]],
      ["DisplayReactor", "ping", [null]],
      ["DisplayReactor", "greet", ["10"]],
      ["DisplayReactor", "balance", ["10"]],
      ["DisplayReactor", "page", [10]],
      ["DisplayReactor", "offset", [-5]],
      ["DisplayReactor", "ratio", [1.5]],
      ["DisplayReactor", "owner_of", [OWNER_TEXT]],
      ["DisplayReactor", "balance_of", [{ owner: OWNER_TEXT }]],
      ["DisplayReactor", "search", [{ _type: "ByOwner", ByOwner: OWNER_TEXT }]],
      ["DisplayReactor", "scores", [[["a", "1"]]]],
      ["DisplayReactor", "legacy", [{ id: "1", old: null }]],
      ["DisplayReactor", "pick", [{ _type: "B" }]],
    ]
    for (const [kind, fn, args] of calls) {
      expect(argsSegment(makeReactor(kind), fn, args)).toBe(generateKey(args))
    }
  })
})
