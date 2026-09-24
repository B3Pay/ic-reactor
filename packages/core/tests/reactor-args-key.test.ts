import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient } from "@tanstack/query-core"
import { QueryResponseStatus } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { Principal } from "@icp-sdk/core/principal"
import { ClientManager } from "../src/client.js"
import { Reactor } from "../src/reactor.js"
import { generateKey } from "../src/utils/helper.js"

const CANISTER_ID = "ryjl3-tyaaa-aaaaa-aaaba-cai"
const OWNER = Principal.fromText("aaaaa-aa")

const Account = IDL.Record({
  owner: IDL.Principal,
  subaccount: IDL.Opt(IDL.Vec(IDL.Nat8)),
})

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({
    icrc1_balance_of: IDL.Func([Account], [IDL.Nat], ["query"]),
    quote: IDL.Func([IDL.Float64], [IDL.Text], ["query"]),
  })

/**
 * The args segment of a query key was `JSON.stringify` of the JavaScript
 * value, which is not an identity of the Candid value it encodes:
 *
 * - Equal records got different keys when their fields were written in a
 *   different order. Candid records are unordered — both orders encode to the
 *   same bytes — and TanStack Query hashes keys order-independently for exactly
 *   this reason, but the pre-serialised string defeated that. A query fetched
 *   as `{ owner, subaccount }` was missed by `getQueryData` and by
 *   `invalidateQueries` spelled `{ subaccount, owner }`, so a balance stayed
 *   stale after the transfer that changed it.
 * - Different floats got the SAME key: JSON writes NaN, Infinity and -Infinity
 *   all as `null`, and -0 as `0`. A query for one returned the cached result of
 *   another without calling the canister.
 */
describe("the args segment of a query key", () => {
  let queryClient: QueryClient
  let reactor: Reactor
  let query: ReturnType<typeof vi.fn>

  beforeEach(() => {
    queryClient = new QueryClient()
    const clientManager = new ClientManager({
      queryClient,
      agentOptions: { host: "https://icp-api.io" },
    })
    query = vi.fn(async (_canisterId: Principal, { methodName, arg }) => {
      const value =
        methodName === "quote"
          ? `quote for ${String(IDL.decode([IDL.Float64], arg)[0])}`
          : 10n
      return {
        status: QueryResponseStatus.Replied,
        reply: {
          arg: IDL.encode(
            [methodName === "quote" ? IDL.Text : IDL.Nat],
            [value]
          ),
        },
      }
    })
    vi.spyOn(clientManager.agent, "query").mockImplementation(query as never)
    reactor = new Reactor({
      clientManager,
      name: "ledger",
      canisterId: CANISTER_ID,
      idlFactory,
    })
  })

  describe("for records", () => {
    const written = [{ owner: OWNER, subaccount: [] }]
    const reordered = [{ subaccount: [], owner: OWNER }]

    it("is the same whatever order the fields are written in", () => {
      expect(
        reactor.generateQueryKey({
          functionName: "icrc1_balance_of" as never,
          args: reordered as never,
        })
      ).toEqual(
        reactor.generateQueryKey({
          functionName: "icrc1_balance_of" as never,
          args: written as never,
        })
      )
    })

    it("lets getQueryData and invalidateQueries find the cached entry", async () => {
      await reactor.fetchQuery({
        functionName: "icrc1_balance_of" as never,
        args: written as never,
      })

      expect(
        reactor.getQueryData({
          functionName: "icrc1_balance_of" as never,
          args: reordered as never,
        })
      ).toBe(10n)

      await reactor.invalidateQueries({
        functionName: "icrc1_balance_of" as never,
        args: reordered as never,
      })
      const key = reactor.generateQueryKey({
        functionName: "icrc1_balance_of" as never,
        args: written as never,
      })
      expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true)
    })
  })

  describe("for floats", () => {
    const FLOATS = [NaN, Infinity, -Infinity, 0, -0]

    it("is distinct for each distinct value", () => {
      const keys = FLOATS.map((x) =>
        JSON.stringify(
          reactor.generateQueryKey({
            functionName: "quote" as never,
            args: [x] as never,
          })
        )
      )
      expect(new Set(keys).size).toBe(FLOATS.length)
    })

    it("does not answer one value's query with another's cached result", async () => {
      await reactor.fetchQuery({
        functionName: "quote" as never,
        args: [Infinity] as never,
      })

      await expect(
        reactor.fetchQuery({
          functionName: "quote" as never,
          args: [NaN] as never,
        })
      ).resolves.toBe("quote for NaN")
      expect(query).toHaveBeenCalledTimes(2)
    })

    // NaN, ±Infinity and -0 have no JSON number form, so they are written as a
    // tag. `generateKey` is public, and an infinite query's `getKeyArgs` may
    // return any value, so a tag that another value can also produce lets two
    // inputs share a cache entry: with the bare string "Infinity" as the tag,
    // `[Infinity]` and `["Infinity"]` would.
    const SPELLED = ["NaN", "Infinity", "-Infinity", "-0"]

    it.each(SPELLED)("is distinct from the string %j", (text) => {
      expect(generateKey([Number(text)])).not.toBe(generateKey([text]))
    })

    it.each(SPELLED)(
      "is not reproduced by passing the key of %s back in as a value",
      (text) => {
        // Whatever shape the tag has, it parses back to a JSON value a caller
        // could pass. That value, and the value its own key parses back to,
        // and so on, must each get a key of their own.
        const keys = [generateKey([Number(text)])]
        for (let i = 0; i < 3; i++) {
          const [value] = JSON.parse(keys[i]) as unknown[]
          keys.push(generateKey([value]))
        }
        expect(new Set(keys).size).toBe(keys.length)
      }
    )

    it("tags them with a leading U+0000, and adds another to a string that starts with one", () => {
      // Pinned because `generateKey` is public and its keys may be persisted.
      expect(generateKey([NaN, Infinity, -Infinity, -0, "\u0000x"])).toBe(
        '["\\u0000NaN","\\u0000Infinity","\\u0000-Infinity","\\u0000-0",' +
          '"\\u0000\\u0000x"]'
      )
    })
  })

  it("keeps the existing encoding for everything else", () => {
    // Guard: keys already in use for primitives, BigInts, arrays, principals,
    // blobs and records written in sorted order are byte-for-byte unchanged.
    expect(
      generateKey([
        "a",
        1,
        2n,
        [3, -4.5],
        true,
        null,
        OWNER,
        new Uint8Array([1, 2]),
        { amount: 5n, to: "x" },
      ])
    ).toBe(
      '["a",1,"2",[3,-4.5],true,null,{"__principal__":"aaaaa-aa"},' +
        '{"0":1,"1":2},{"amount":"5","to":"x"}]'
    )
  })
})
