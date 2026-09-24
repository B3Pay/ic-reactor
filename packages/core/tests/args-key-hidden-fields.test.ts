import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient } from "@tanstack/query-core"
import { QueryResponseStatus } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { Principal } from "@icp-sdk/core/principal"
import { ClientManager } from "../src/client.js"
import { Reactor } from "../src/reactor.js"
import { DisplayReactor } from "../src/display-reactor.js"

/**
 * IDL.encode reads a record's fields with `hasOwnProperty`, and a
 * DisplayReactor's codecs read a record's fields and a variant's `_type` and
 * payload with `hasLabel`. Both find an own property defined as not
 * enumerable, and send it. The query key was the JSON of a plain object,
 * and JSON leaves such a property out, so two records that differed only in
 * it were keyed alike although they sent different bytes, and the second was
 * answered with the first one's result: the fault #768 fixed for class
 * instances, in a plain object.
 */

const CANISTER_ID = "ryjl3-tyaaa-aaaaa-aaaba-cai"

const Quote = IDL.Record({ amount: IDL.Nat })
const Pick = IDL.Variant({ A: IDL.Nat, B: IDL.Nat })

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({
    quote: IDL.Func([Quote], [IDL.Nat], ["query"]),
    pick: IDL.Func([Pick], [IDL.Nat], ["query"]),
  })

/** `target` with `key` defined on it as an own property that is not enumerable. */
const withHidden = <T extends object>(target: T, key: string, value: unknown) =>
  Object.defineProperty(target, key, { value })

let clientManager: ClientManager
/** The Candid argument bytes of each query the agent was asked to send. */
let sent: string[]

beforeEach(() => {
  clientManager = new ClientManager({
    // No retries: a call that fails should fail at once.
    queryClient: new QueryClient({
      defaultOptions: { queries: { retry: false } },
    }),
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

const makeDisplay = () =>
  new DisplayReactor({
    clientManager,
    name: "display",
    canisterId: CANISTER_ID,
    idlFactory,
  })

const makeCandid = () =>
  new Reactor({
    clientManager,
    name: "candid",
    canisterId: CANISTER_ID,
    idlFactory,
  })

type AnyReactor = ReturnType<typeof makeDisplay> | ReturnType<typeof makeCandid>

/** The args segment: the last element of a key built with args. */
const argsSegment = (reactor: AnyReactor, fn: string, arg: unknown) => {
  const key = reactor.generateQueryKey({
    functionName: fn as never,
    args: [arg] as never,
  })
  return key[key.length - 1]
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

describe("a record field that is not enumerable", () => {
  it("keeps two DisplayReactor records apart that differ only there", async () => {
    const reactor = makeDisplay()
    const forms = [withHidden({}, "amount", "1"), withHidden({}, "amount", "2")]

    expect(argsSegment(reactor, "quote", forms[0])).not.toBe(
      argsSegment(reactor, "quote", forms[1])
    )
    expect(await fetchEach(reactor, "quote", forms)).toEqual(["1", "2"])
    expect(sent[0]).not.toBe(sent[1])
  })

  it("gets the DisplayReactor key of the plain record that sends the same bytes", async () => {
    const reactor = makeDisplay()
    const hidden = withHidden({}, "amount", "1")

    expect(argsSegment(reactor, "quote", hidden)).toBe(
      argsSegment(reactor, "quote", { amount: "1" })
    )
    expect(
      await fetchEach(reactor, "quote", [{ amount: "1" }, hidden])
    ).toEqual(["1", "1"])
    expect(sent).toHaveLength(1)
  })

  it("keeps two Reactor records apart that differ only there", async () => {
    const reactor = makeCandid()
    const forms = [withHidden({}, "amount", 1n), withHidden({}, "amount", 2n)]

    expect(argsSegment(reactor, "quote", forms[0])).toBe(
      argsSegment(reactor, "quote", { amount: 1n })
    )
    expect(await fetchEach(reactor, "quote", forms)).toEqual([1n, 2n])
    expect(sent[0]).not.toBe(sent[1])
  })
})

describe("a DisplayReactor variant field that is not enumerable", () => {
  it("keeps two payloads apart, and apart from the refused variant without one", async () => {
    const reactor = makeDisplay()
    const forms = [
      withHidden({ _type: "A" }, "A", "1"),
      withHidden({ _type: "A" }, "A", "2"),
    ]

    expect(await fetchEach(reactor, "pick", forms)).toEqual(["1", "2"])
    expect(sent[0]).not.toBe(sent[1])

    // `{ _type: "A" }` has no payload for a `nat` arm, which IDL.encode
    // refuses. Its JSON was that of both variants above.
    await expect(
      reactor.fetchQuery({
        functionName: "pick",
        args: [{ _type: "A" }] as never,
      })
    ).rejects.toThrow()
    expect(sent).toHaveLength(2)
  })

  it("gets the key of the variant it sends when its _type is hidden", async () => {
    const reactor = makeDisplay()
    const hidden = withHidden({ A: "1" }, "_type", "A")

    expect(argsSegment(reactor, "pick", hidden)).toBe(
      argsSegment(reactor, "pick", { _type: "A", A: "1" })
    )
    expect(await fetchEach(reactor, "pick", [hidden])).toEqual(["1"])

    // A second arm, even an undefined one, is refused, and its JSON was that
    // of the variant above.
    await expect(
      reactor.fetchQuery({
        functionName: "pick",
        args: [{ A: "1", B: undefined }] as never,
      })
    ).rejects.toThrow()
    expect(sent).toHaveLength(1)
  })
})
