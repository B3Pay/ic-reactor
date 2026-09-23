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
 * A blob argument can be written more than one way: IDL.encode takes a
 * `Uint8Array` or a plain byte array, and a DisplayReactor also takes hex text,
 * with or without `0x`, in either case. Every form sends the same bytes, so the
 * canister answers them alike, but the args segment of the query key was the
 * JSON of the JavaScript value: `{"0":1,"1":2}` for the bytes, `[1,2]` for the
 * array, `"0102"` for the text. Each form got its own cache entry, so a query
 * already cached under one form called the canister again under another, and
 * `getQueryData` or `invalidateQueries` written with another form missed it.
 */

const CANISTER_ID = "ryjl3-tyaaa-aaaaa-aaaba-cai"
const OWNER = "aaaaa-aa"

const Account = IDL.Record({
  owner: IDL.Principal,
  subaccount: IDL.Opt(IDL.Vec(IDL.Nat8)),
})
const Payload = IDL.Variant({
  Amount: IDL.Nat64,
  Note: IDL.Text,
  Ports: IDL.Vec(IDL.Nat16),
})
const Transfer = IDL.Record({
  to: Account,
  amount: IDL.Nat,
  fee: IDL.Opt(IDL.Nat),
  memo: IDL.Opt(IDL.Vec(IDL.Nat8)),
  created_at_time: IDL.Opt(IDL.Nat64),
})

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({
    // A bare blob argument.
    lookup: IDL.Func([IDL.Vec(IDL.Nat8)], [IDL.Nat], ["query"]),
    // An `opt blob` inside a record: an ICRC-1 account.
    balance_of: IDL.Func([Account], [IDL.Nat], ["query"]),
    // Not a blob: a `number[]` here is a vector of nat16s.
    ports: IDL.Func([IDL.Vec(IDL.Nat16)], [IDL.Nat], ["query"]),
    // Records, variants, bigints, principals, opts and vectors of non-bytes
    // around the blobs.
    preview: IDL.Func(
      [Transfer, Payload, IDL.Vec(IDL.Principal), IDL.Opt(IDL.Vec(IDL.Int32))],
      [IDL.Nat],
      ["query"]
    ),
    // No blob anywhere.
    quote: IDL.Func(
      [IDL.Record({ owner: IDL.Principal, amount: IDL.Nat }), Payload],
      [IDL.Nat],
      ["query"]
    ),
  })

const BYTES = [0x01, 0x0a, 0xff]
const HEX = "010aff"
/** How the key writes a blob: a tag no argument can produce, then its hex. */
const BLOB = `\u0000blob:${HEX}`

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
  new Reactor({
    clientManager,
    name: "raw",
    canisterId: CANISTER_ID,
    idlFactory,
  })

const makeDisplayReactor = () =>
  new DisplayReactor({
    clientManager,
    name: "display",
    canisterId: CANISTER_ID,
    idlFactory,
  })

type AnyReactor = Reactor | DisplayReactor

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

describe("a blob argument's query key", () => {
  describe("in a Reactor", () => {
    const forms = () => [new Uint8Array(BYTES), [...BYTES]]

    it("is one key whether the blob is a Uint8Array or a byte array", () => {
      expect(distinctKeys(makeReactor(), "lookup", forms()).size).toBe(1)
    })

    it("writes the blob as a tag and its lowercase hex", () => {
      expect(
        argsSegment(makeReactor(), "lookup", [new Uint8Array(BYTES)])
      ).toBe(JSON.stringify([BLOB]))
    })

    it("does not call the canister again for the other form", async () => {
      const reactor = makeReactor()
      for (const form of forms()) {
        await expect(
          reactor.fetchQuery({
            functionName: "lookup" as never,
            args: [form] as never,
          })
        ).resolves.toBe(1n)
      }
      expect(sent).toHaveLength(1)
    })

    it("lets getQueryData and invalidateQueries written with the other form find the entry", async () => {
      const reactor = makeReactor()
      await reactor.fetchQuery({
        functionName: "lookup" as never,
        args: [new Uint8Array(BYTES)] as never,
      })

      const other = {
        functionName: "lookup" as never,
        args: [[...BYTES]] as never,
      }
      expect(reactor.getQueryData(other)).toBe(1n)

      reactor.invalidateQueries(other)
      const key = keyOf(reactor, "lookup", [new Uint8Array(BYTES)])
      expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true)
    })

    it("is one key for an opt blob inside a record", () => {
      const reactor = makeReactor()
      const owner = Principal.fromText(OWNER)
      const accounts = [
        { owner, subaccount: [new Uint8Array(BYTES)] },
        { owner, subaccount: [[...BYTES]] },
      ]
      expect(distinctKeys(reactor, "balance_of", accounts).size).toBe(1)
    })

    it("keeps hex text, which IDL.encode refuses, apart from the bytes it spells", async () => {
      const reactor = makeReactor()
      expect(argsSegment(reactor, "lookup", [HEX])).toBe(generateKey([HEX]))
      expect(distinctKeys(reactor, "lookup", [HEX, [...BYTES]]).size).toBe(2)

      // So the call that fails is not answered from the bytes' cache entry.
      await reactor.fetchQuery({
        functionName: "lookup" as never,
        args: [[...BYTES]] as never,
      })
      await expect(
        reactor.fetchQuery({
          functionName: "lookup" as never,
          args: [HEX] as never,
        })
      ).rejects.toThrow()
    })
  })

  describe("in a DisplayReactor", () => {
    const forms = () => [
      HEX,
      HEX.toUpperCase(),
      `0x${HEX}`,
      `0X${HEX.toUpperCase()}`,
      new Uint8Array(BYTES),
      [...BYTES],
    ]

    it("is one key for hex text in any case, bytes and a byte array", () => {
      expect(distinctKeys(makeDisplayReactor(), "lookup", forms()).size).toBe(1)
    })

    it("writes the blob as a tag and its lowercase hex", () => {
      expect(
        argsSegment(makeDisplayReactor(), "lookup", [`0X${HEX.toUpperCase()}`])
      ).toBe(JSON.stringify([BLOB]))
    })

    it("calls the canister once for every form, which all send the same bytes", async () => {
      const reactor = makeDisplayReactor()
      for (const form of forms()) {
        await expect(
          reactor.fetchQuery({
            functionName: "lookup" as never,
            args: [form] as never,
          })
        ).resolves.toBe("1")
      }
      expect(sent).toHaveLength(1)

      // Each form on its own sends the bytes the first one sent.
      for (const form of forms()) {
        await reactor.callMethod({
          functionName: "lookup" as never,
          args: [form] as never,
        })
      }
      expect(new Set(sent).size).toBe(1)
    })

    it("is one key for an opt blob inside a record, wrapped or bare", () => {
      const reactor = makeDisplayReactor()
      const wrapped = [
        [HEX],
        [`0x${HEX.toUpperCase()}`],
        [new Uint8Array(BYTES)],
        [[...BYTES]],
      ].map((subaccount) => ({ owner: OWNER, subaccount }))
      const bare = [HEX, `0x${HEX}`, new Uint8Array(BYTES), [...BYTES]].map(
        (subaccount) => ({ owner: OWNER, subaccount })
      )

      expect(distinctKeys(reactor, "balance_of", wrapped).size).toBe(1)
      expect(distinctKeys(reactor, "balance_of", bare).size).toBe(1)
    })

    it("reads a one-byte array as the optional codec does: a bare blob, not a wrapper", async () => {
      const reactor = makeDisplayReactor()
      // `[10]` holds a number, not a blob, so the codec takes it as the blob
      // itself: the same account as the bare forms of 0x0a.
      const accounts = [[10], "0a", new Uint8Array([10])].map((subaccount) => ({
        owner: OWNER,
        subaccount,
      }))
      expect(distinctKeys(reactor, "balance_of", accounts).size).toBe(1)

      for (const account of accounts) {
        await reactor.callMethod({
          functionName: "balance_of" as never,
          args: [account] as never,
        })
      }
      expect(new Set(sent).size).toBe(1)
    })

    it("keeps hex text the codec refuses as it was, apart from the bytes it spells", async () => {
      const reactor = makeDisplayReactor()
      for (const text of ["abc", "0xabc", "zz", "0x0x01"]) {
        expect(argsSegment(reactor, "lookup", [text])).toBe(generateKey([text]))
      }
      // Odd-length hex used to be read with a leading zero (#648).
      expect(distinctKeys(reactor, "lookup", ["abc", [0x0a, 0xbc]]).size).toBe(
        2
      )

      await reactor.fetchQuery({
        functionName: "lookup" as never,
        args: ["0abc"] as never,
      })
      await expect(
        reactor.fetchQuery({
          functionName: "lookup" as never,
          args: ["abc"] as never,
        })
      ).rejects.toThrow(/odd number of hex digits/)
    })
  })

  it("keeps distinct bytes distinct", () => {
    for (const reactor of [makeReactor(), makeDisplayReactor()]) {
      const blobs = [[], [0], [0, 0], [1, 10], [0x11, 0x0a], [1, 10, 255]]
      expect(distinctKeys(reactor, "lookup", blobs).size).toBe(blobs.length)
    }
  })

  it("keeps a value that is not a blob apart from the bytes whose hex it spells", () => {
    // A bigint is written as its digits, which are also hex. Neither reactor
    // sends one as a blob, and a DisplayReactor's hex text used to share its
    // key.
    for (const reactor of [makeReactor(), makeDisplayReactor()]) {
      expect(distinctKeys(reactor, "lookup", [10n, [0x10]]).size).toBe(2)
    }
    expect(distinctKeys(makeDisplayReactor(), "lookup", [10n, "10"]).size).toBe(
      2
    )
  })

  it("writes only the blobs differently in arguments that also hold other values", () => {
    const owner = Principal.fromText(OWNER)
    const blob = JSON.stringify(BLOB)
    expect(
      argsSegment(makeReactor(), "preview", [
        {
          to: { owner, subaccount: [new Uint8Array(BYTES)] },
          amount: 1n,
          fee: [],
          memo: [[...BYTES]],
          created_at_time: [7n],
        },
        { Note: "x" },
        [owner],
        [],
      ])
    ).toBe(
      `[{"amount":"1","created_at_time":["7"],"fee":[],"memo":[${blob}],` +
        `"to":{"owner":{"__principal__":"aaaaa-aa"},"subaccount":[${blob}]}},` +
        `{"Note":"x"},[{"__principal__":"aaaaa-aa"}],[]]`
    )

    expect(
      argsSegment(makeDisplayReactor(), "preview", [
        {
          to: { owner: OWNER, subaccount: new Uint8Array(BYTES) },
          amount: "1",
          memo: [`0x${HEX.toUpperCase()}`],
          created_at_time: "7",
        },
        { _type: "Note", Note: "x" },
        [OWNER],
        undefined,
      ])
    ).toBe(
      `[{"amount":"1","created_at_time":"7","memo":[${blob}],` +
        `"to":{"owner":"aaaaa-aa","subaccount":${blob}}},` +
        `{"Note":"x","_type":"Note"},["aaaaa-aa"],null]`
    )
  })
})

describe("the key of every argument that is not a blob", () => {
  // A `number[]` is a blob only where the Candid type is `vec nat8`.
  it("keeps a vec nat16 of small numbers as the array it is", () => {
    for (const reactor of [makeReactor(), makeDisplayReactor()]) {
      expect(argsSegment(reactor, "ports", [[1, 10, 255]])).toBe(
        generateKey([[1, 10, 255]])
      )
    }
  })

  it("is byte-identical to the key before, in a Reactor", () => {
    const reactor = makeReactor()
    const owner = Principal.fromText(OWNER)
    const payloads = [
      { Amount: 18_446_744_073_709_551_615n },
      { Note: "0102" },
      { Ports: [1, 2, 3] },
      { Ports: new Uint16Array([1, 2, 3]) },
    ]

    for (const payload of payloads) {
      const quote = [{ owner, amount: 5n }, payload]
      expect(argsSegment(reactor, "quote", quote)).toBe(generateKey(quote))

      const preview = [
        {
          to: { owner, subaccount: [] },
          amount: 100_000_000n,
          fee: [10_000n],
          memo: [],
          created_at_time: [],
        },
        payload,
        [owner, Principal.fromText(CANISTER_ID)],
        [[-1, 0, 2_147_483_647]],
      ]
      expect(argsSegment(reactor, "preview", preview)).toBe(
        generateKey(preview)
      )
    }
  })

  it("is byte-identical to the key before, in a DisplayReactor", () => {
    const reactor = makeDisplayReactor()
    const payloads = [
      { _type: "Amount", Amount: "18446744073709551615" },
      { Note: "0102" },
      { _type: "Ports", Ports: [1, 2, 3] },
    ]

    for (const payload of payloads) {
      const quote = [{ owner: OWNER, amount: "5" }, payload]
      expect(argsSegment(reactor, "quote", quote)).toBe(generateKey(quote))

      const preview = [
        {
          to: { owner: OWNER, subaccount: undefined },
          amount: "100000000",
          fee: "10000",
          memo: null,
          created_at_time: [],
        },
        payload,
        [OWNER, CANISTER_ID],
        [-1, 0, 2_147_483_647],
      ]
      expect(argsSegment(reactor, "preview", preview)).toBe(
        generateKey(preview)
      )
    }
  })
})
