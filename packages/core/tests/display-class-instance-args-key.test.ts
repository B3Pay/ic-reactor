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
 * A DisplayReactor's record codec reads each field with `hasLabel`, which
 * also finds a getter the value's class declares, and the variant codec reads
 * `_type` and the payload the same way. The args segment of the query key was
 * the JSON of such a value, and JSON writes only own enumerable properties,
 * so a record given as a class instance whose fields are getters over private
 * fields was keyed `{}` whatever it sent. Two calls sending different amounts
 * shared one cache entry, and the second was answered with the first one's
 * result (#768). A class whose fields are its own was keyed in its own field
 * order, apart from the plain record that sends the same bytes.
 */

const CANISTER_ID = "ryjl3-tyaaa-aaaaa-aaaba-cai"
const OWNER = "aaaaa-aa"
const OTHER = "2vxsx-fae"

const Quote = IDL.Record({ amount: IDL.Nat })
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
    quote: IDL.Func([Quote], [IDL.Nat], ["query"]),
    balance_of: IDL.Func([Account], [IDL.Nat], ["query"]),
    search: IDL.Func([Filter], [IDL.Nat], ["query"]),
    order: IDL.Func(
      [IDL.Record({ quote: Quote, filter: Filter })],
      [IDL.Nat],
      ["query"]
    ),
  })

/** A record whose one field is a getter over a private field. */
class QuoteArgs {
  #amount: string
  constructor(amount: string) {
    this.#amount = amount
  }
  get amount() {
    return this.#amount
  }
}

/** A variant whose `_type` and payload are getters. */
class ByOwner {
  #owner: string
  constructor(owner: string) {
    this.#owner = owner
  }
  get _type() {
    return "ByOwner" as const
  }
  get ByOwner() {
    return this.#owner
  }
}

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

type AnyReactor = ReturnType<typeof makeReactor> | Reactor

/** The args segment: the last element of a key built with args. */
const argsSegment = (reactor: AnyReactor, fn: string, args: unknown[]) => {
  const key = reactor.generateQueryKey({
    functionName: fn as never,
    args: args as never,
  })
  return key[key.length - 1]
}

/** The distinct keys among `forms`, each passed as the only argument. */
const distinctKeys = (reactor: AnyReactor, fn: string, forms: unknown[]) =>
  new Set(forms.map((form) => argsSegment(reactor, fn, [form])))

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

describe("a record given to a DisplayReactor as a class instance (#768)", () => {
  it("is keyed by the fields it sends, not as {}", () => {
    const reactor = makeReactor()
    expect(argsSegment(reactor, "quote", [new QuoteArgs("1")])).toBe(
      generateKey([{ amount: "1" }])
    )
  })

  it("keeps two instances that send different records apart", async () => {
    const reactor = makeReactor()
    const forms = [new QuoteArgs("1"), new QuoteArgs("2")]

    const [one, two] = await sentBy(reactor, "quote", forms)
    expect(one).not.toBe(two)
    expect(distinctKeys(reactor, "quote", forms).size).toBe(2)
    expect(await fetchEach(reactor, "quote", forms)).toEqual(["3", "4"])
  })

  it("shares the key of the plain record that sends the same bytes", async () => {
    const reactor = makeReactor()
    const forms = [{ amount: "1" }, new QuoteArgs("1")]

    expect(new Set(await sentBy(reactor, "quote", forms)).size).toBe(1)
    expect(distinctKeys(reactor, "quote", forms).size).toBe(1)
    expect(await fetchEach(reactor, "quote", forms)).toEqual(["3", "3"])
  })

  it("keys a class's own fields in any order, without what it does not declare", async () => {
    class AccountArgs {
      label = "savings"
      subaccount = "0a"
      owner = OWNER
      describe() {
        return this.label
      }
    }
    const reactor = makeReactor()
    const forms = [{ owner: OWNER, subaccount: "0a" }, new AccountArgs()]

    expect(new Set(await sentBy(reactor, "balance_of", forms)).size).toBe(1)
    expect(distinctKeys(reactor, "balance_of", forms).size).toBe(1)
  })

  it("is keyed by what it sends inside another record", async () => {
    const reactor = makeReactor()
    const forms = [
      { quote: new QuoteArgs("1"), filter: { _type: "All" } },
      { quote: new QuoteArgs("2"), filter: { _type: "All" } },
    ]
    expect(await fetchEach(reactor, "order", forms)).toEqual(["1", "2"])
    expect(sent[0]).not.toBe(sent[1])
  })
})

describe("a variant given to a DisplayReactor as a class instance (#768)", () => {
  it("keeps two instances that send different arms or payloads apart", async () => {
    const reactor = makeReactor()
    const forms = [new ByOwner(OWNER), new ByOwner(OTHER)]

    const [one, two] = await sentBy(reactor, "search", forms)
    expect(one).not.toBe(two)
    expect(distinctKeys(reactor, "search", forms).size).toBe(2)
    expect(await fetchEach(reactor, "search", forms)).toEqual(["3", "4"])
  })

  it("shares the key of the plain variant that sends the same bytes", async () => {
    const reactor = makeReactor()
    const forms = [
      { _type: "ByOwner", ByOwner: OWNER },
      { ByOwner: OWNER },
      new ByOwner(OWNER),
    ]
    expect(new Set(await sentBy(reactor, "search", forms)).size).toBe(1)
    expect(distinctKeys(reactor, "search", forms).size).toBe(1)

    // An instance whose one own field names the arm.
    class ByMemo {
      ByMemo = "rent"
    }
    const memos = [{ _type: "ByMemo", ByMemo: "rent" }, new ByMemo()]
    expect(new Set(await sentBy(reactor, "search", memos)).size).toBe(1)
    expect(distinctKeys(reactor, "search", memos).size).toBe(1)
  })

  it("is keyed by what it sends inside a record", async () => {
    const reactor = makeReactor()
    const forms = [
      { quote: { amount: "1" }, filter: new ByOwner(OWNER) },
      { quote: { amount: "1" }, filter: new ByOwner(OTHER) },
    ]
    expect(await fetchEach(reactor, "order", forms)).toEqual(["1", "2"])
    expect(sent[0]).not.toBe(sent[1])
  })
})

describe("the key of a class instance in a Reactor", () => {
  it("is unchanged", () => {
    // IDL.encode reads only a record's own fields, so a Reactor's key keeps
    // the JSON of the instance.
    class AccountArgs {
      subaccount: [] = []
      owner = Principal.fromText(OWNER)
    }
    const reactor = new Reactor({
      clientManager,
      name: "candid",
      canisterId: CANISTER_ID,
      idlFactory,
    })
    const account = new AccountArgs()
    expect(argsSegment(reactor, "balance_of", [account])).toBe(
      generateKey([account])
    )
  })
})
