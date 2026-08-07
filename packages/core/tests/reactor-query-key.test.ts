import { describe, it, expect, beforeEach } from "vitest"
import { QueryClient } from "@tanstack/query-core"
import { hashKey } from "@tanstack/query-core"
import { IDL } from "@icp-sdk/core/candid"
import { Reactor } from "../src/reactor.js"
import { DisplayReactor } from "../src/display-reactor.js"
import { ClientManager } from "../src/client.js"

const CANISTER_ID = "ryjl3-tyaaa-aaaaa-aaaba-cai"

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({
    total_supply: IDL.Func([], [IDL.Nat], ["query"]),
    balance_of: IDL.Func([IDL.Principal], [IDL.Nat], ["query"]),
  })

describe("Reactor.generateQueryKey", () => {
  let clientManager: ClientManager

  beforeEach(() => {
    clientManager = new ClientManager({
      queryClient: new QueryClient(),
      agentOptions: { host: "https://icp-api.io" },
    })
  })

  const makeReactor = () =>
    new Reactor<any>({
      clientManager,
      name: "raw",
      canisterId: CANISTER_ID,
      idlFactory,
    })

  const makeDisplayReactor = () =>
    new DisplayReactor<any>({
      clientManager,
      name: "display",
      canisterId: CANISTER_ID,
      idlFactory,
    })

  describe("transform scoping", () => {
    it("keeps candid keys free of a transform segment", () => {
      expect(
        makeReactor().generateQueryKey({ functionName: "total_supply" })
      ).toEqual([CANISTER_ID, "total_supply"])
    })

    it("separates a DisplayReactor from a Reactor over the same canister", () => {
      // Both return the same method's data in different shapes (string nats vs
      // bigints), so sharing one cache entry would serve one the other's values.
      const raw = makeReactor().generateQueryKey({
        functionName: "total_supply",
      })
      const display = makeDisplayReactor().generateQueryKey({
        functionName: "total_supply",
      })

      expect(display).not.toEqual(raw)
      expect(hashKey(display)).not.toBe(hashKey(raw))
      expect(display).toEqual([
        CANISTER_ID,
        "total_supply",
        { transform: "display" },
      ])
    })

    it("keeps the transform segment ahead of args so prefix invalidation matches", () => {
      const display = makeDisplayReactor()
      const withArgs = display.generateQueryKey({
        functionName: "balance_of",
        args: ["aaaaa-aa"] as never,
      })
      // The prefix `invalidateQueries({ functionName })` builds must still be a
      // prefix of a key that carries args.
      const prefix = display.generateQueryKey({ functionName: "balance_of" })

      expect(withArgs.slice(0, prefix.length)).toEqual(prefix)
    })

    it("still starts every key with the canister id for identity-switch invalidation", () => {
      // ClientManager.updateAgent cancels/invalidates by the [canisterId] prefix.
      expect(
        makeDisplayReactor().generateQueryKey({
          functionName: "total_supply",
        })[0]
      ).toBe(CANISTER_ID)
    })
  })

  describe("custom queryKey segments", () => {
    it("renders a BigInt segment as a string instead of throwing when hashed", () => {
      const key = makeReactor().generateQueryKey({
        functionName: "balance_of",
        queryKey: ["blocks", 7n],
      })

      expect(key).toEqual([CANISTER_ID, "balance_of", "blocks", "7"])
      expect(() => hashKey(key)).not.toThrow()
    })

    it("converts BigInts nested in plain objects and arrays", () => {
      const key = makeReactor().generateQueryKey({
        functionName: "balance_of",
        queryKey: [{ page: { size: 10n } }, [1n, 2n]],
      })

      expect(key).toEqual([
        CANISTER_ID,
        "balance_of",
        { page: { size: "10" } },
        ["1", "2"],
      ])
      expect(() => hashKey(key)).not.toThrow()
    })

    it("leaves ordinary segments untouched", () => {
      expect(
        makeReactor().generateQueryKey({
          functionName: "balance_of",
          queryKey: ["v2", 3, true, null],
        })
      ).toEqual([CANISTER_ID, "balance_of", "v2", 3, true, null])
    })
  })
})
