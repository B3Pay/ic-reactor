/**
 * Query keys (DECISIONS Q5): who the read is made as, which canister, which
 * method, and the Candid encoding of the arguments, with the tags that stand
 * in for arguments that are skipped or do not encode and for a canister name
 * that does not resolve.
 */
import { readFileSync } from "node:fs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { principal, serviceMethods } from "@candid-core/schema"
import { encodeArgs } from "@candid-core/schema/codec"
import { schemaFromContract } from "@candid-core/schema/contract"
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity"
import {
  QueryClient,
  dehydrate,
  hydrate,
  skipToken,
} from "@tanstack/query-core"
import { toHex } from "../src/keys.js"
import { createTestAuth } from "../src/testing/index.js"
import {
  ANONYMOUS,
  FEE,
  LEDGER,
  SHAPES,
  clientAs,
  clientWithAuth,
  ledgerCanister,
  replicaWith,
  serve,
} from "./canister-helpers.js"
import * as icrc1 from "./fixtures/icrc1.js"
import * as shapes from "./fixtures/shapes.js"

afterEach(() => {
  vi.unstubAllGlobals()
})

const alice = Ed25519KeyIdentity.generate()
const ALICE = principal(alice.getPrincipal().toText())
const account = { owner: ALICE, subaccount: null }

const hexOf = (
  schemas: Parameters<typeof encodeArgs>[0],
  values: unknown[]
): string => {
  const encoded = encodeArgs(schemas, values)
  if (!encoded.ok) throw new Error("the fixture does not encode")
  return toHex(encoded.bytes)
}

function setup() {
  const replica = replicaWith({})
  const client = clientAs(replica, alice)
  return {
    replica,
    client,
    ledger: client.canister<icrc1.Actor>(icrc1.actor, { id: LEDGER }),
    canister: client.canister<shapes.Actor>(shapes.actor, { id: SHAPES }),
  }
}

describe("a read's key", () => {
  it("is ic-reactor, the network, the caller, the canister, the method and the hex of the encoded arguments", () => {
    const { client, ledger } = setup()
    const key = client.queryOptions(
      ledger,
      "icrc1_balance_of",
      account
    ).queryKey
    expect(key).toEqual([
      "ic-reactor",
      client.network,
      ALICE,
      LEDGER,
      "icrc1_balance_of",
      hexOf([icrc1.Account], [account]),
    ])
    expect(client.queryKey(ledger, "icrc1_balance_of", account)).toEqual(key)
  })

  it("is the same whatever the order of a record's keys", () => {
    const { client, ledger } = setup()
    expect(
      client.queryKey(ledger, "icrc1_balance_of", {
        subaccount: null,
        owner: ALICE,
      })
    ).toEqual(client.queryKey(ledger, "icrc1_balance_of", account))
  })

  it("is the same for the generated schema and for the one schemaFromContract loads", () => {
    const envelope: unknown = JSON.parse(
      readFileSync(
        new URL("./fixtures/icrc1.envelope.json", import.meta.url),
        "utf8"
      )
    )
    const loaded = schemaFromContract(envelope)
    if (!loaded.ok || loaded.actor === undefined) {
      throw new Error("the envelope does not load")
    }
    const { client, ledger } = setup()
    const fromContract = client.canister<icrc1.Actor>(loaded.actor, {
      id: LEDGER,
    })
    expect(fromContract).not.toBe(ledger)
    for (const [method, vars] of [
      ["icrc1_balance_of", account],
      ["icrc1_fee", undefined],
      [
        "icrc1_transfer",
        {
          to: account,
          amount: 5n,
          fee: null,
          memo: new Uint8Array([1]),
          from_subaccount: null,
          created_at_time: 1n,
        },
      ],
    ] as const) {
      expect(client.queryKey(fromContract, method, vars as never)).toEqual(
        client.queryKey(ledger, method, vars as never)
      )
    }
  })

  it("holds whoever is signed in when it is built", async () => {
    const replica = replicaWith({})
    const auth = createTestAuth({ seed: 1, signedIn: false })
    const client = clientWithAuth(replica, auth)
    const ledger = client.canister<icrc1.Actor>(icrc1.actor, { id: LEDGER })
    // queryOptions and queryKey build the same key, with the caller of now.
    const caller = () => {
      const key = client.queryOptions(
        ledger,
        "icrc1_balance_of",
        account
      ).queryKey
      expect(client.queryKey(ledger, "icrc1_balance_of", account)).toEqual(key)
      expect(client.queryKey(ledger)[2]).toBe(key[2])
      return key[2]
    }
    expect(caller()).toBe(ANONYMOUS)
    await auth.signIn()
    const first = client.caller()
    expect(caller()).toBe(first)
    auth.switchTo(2)
    expect(caller()).toBe(client.caller())
    expect(caller()).not.toBe(first)
    await auth.signOut()
    expect(caller()).toBe(ANONYMOUS)
  })

  it("ends in certified for a certified canister, and its prefixes match both", () => {
    const { client, canister } = setup()
    const certified = client.canister<shapes.Actor>(shapes.actor, {
      id: SHAPES,
      certified: true,
    })
    const plain = client.queryKey(canister, "one", 1n)
    const sure = client.queryKey(certified, "one", 1n)
    expect(sure).toEqual([...plain, "certified"])
    expect(client.queryOptions(certified, "one", 1n).queryKey).toEqual(sure)
    expect(client.queryKey(certified, "one")).toEqual(
      client.queryKey(canister, "one")
    )
  })

  it("is cut short to a prefix when the arguments or the method are left out", () => {
    const { client, canister } = setup()
    const full = client.queryKey(canister, "pair", [1n, "x"])
    expect(client.queryKey(canister, "pair")).toEqual(full.slice(0, 5))
    expect(client.queryKey(canister)).toEqual(full.slice(0, 4))
    expect(client.queryKey(canister, "nothing", undefined)).toEqual([
      ...full.slice(0, 4),
      "nothing",
      hexOf([], []),
    ])
  })

  it("is the read's whole key for a method without arguments, with or without the vars", async () => {
    const replica = replicaWith({ [LEDGER]: ledgerCanister(new Map()) })
    const client = clientAs(replica, alice)
    const ledger = client.canister<icrc1.Actor>(icrc1.actor, { id: LEDGER })
    const fee = client.queryOptions(ledger, "icrc1_fee")
    expect(client.queryKey(ledger, "icrc1_fee")).toEqual(fee.queryKey)
    expect(client.queryKey(ledger, "icrc1_fee", undefined)).toEqual(
      fee.queryKey
    )
    // What a cache read and write are handed: the key must be whole, as
    // getQueryData and setQueryData match it exactly.
    await client.queryClient.fetchQuery(fee)
    expect(
      client.queryClient.getQueryData(client.queryKey(ledger, "icrc1_fee"))
    ).toBe(FEE)
    client.queryClient.setQueryData(client.queryKey(ledger, "icrc1_fee"), 1n)
    expect(client.queryClient.getQueryData(fee.queryKey)).toBe(1n)
    expect(
      client.queryClient.getQueryCache().findAll({ queryKey: fee.queryKey })
    ).toHaveLength(1)
  })

  it("takes a two-argument method's variables as the tuple", () => {
    const { client, canister } = setup()
    const pair = serviceMethods(shapes.actor).get("pair")
    if (pair === undefined) throw new Error("the fixture has no pair method")
    const key = client.queryKey(canister, "pair", [1n, "x"])
    expect(key[key.length - 1]).toBe(hexOf(pair.args, [1n, "x"]))
  })

  it("tags skipped arguments with $skip", () => {
    const { client, ledger } = setup()
    const options = client.queryOptions(ledger, "icrc1_balance_of", skipToken)
    expect(options.queryKey.slice(4)).toEqual(["icrc1_balance_of", "$skip"])
    expect(options.queryFn).toBe(skipToken)
    expect(
      client.queryKey(ledger, "icrc1_balance_of", skipToken as never)
    ).toEqual(options.queryKey)
  })

  it("tags arguments that do not encode with $invalid and a stable text of them, without throwing", () => {
    const { client, canister } = setup()
    const cyclic: Record<string, unknown> = {
      n: 1n,
      bytes: new Uint8Array([255]),
    }
    cyclic.self = cyclic
    const odd = [1, cyclic, undefined, Symbol("s"), () => 0, -0, NaN]
    const keyOf = (vars: unknown) =>
      client.queryOptions(canister, "one", vars as bigint).queryKey
    const key = keyOf(odd)
    expect(key.slice(4, 6)).toEqual(["one", "$invalid"])
    expect(key).toHaveLength(7)
    expect(keyOf(odd)).toEqual(key)
    expect(keyOf(2)).not.toEqual(keyOf(3))
    expect(keyOf({ b: 1, a: 2 })).toEqual(keyOf({ a: 2, b: 1 }))
    // A key is JSON, so TanStack can hash it.
    expect(() => JSON.stringify(key)).not.toThrow()
  })

  it("holds $unresolved:<name> for a { name } the cookie does not resolve", () => {
    const { client } = setup()
    const byName = client.canister<shapes.Actor>(shapes.actor, {
      name: "backend",
    })
    expect(client.queryKey(byName, "one", 1n)[3]).toBe("$unresolved:backend")
    expect(client.queryOptions(byName, "one", 1n).queryKey[3]).toBe(
      "$unresolved:backend"
    )
  })

  it("throws a TypeError for a method the service does not have, or a canister of another client", () => {
    const { client, canister } = setup()
    const other = setup().canister
    expect(() => client.queryKey(canister, "nope" as "one")).toThrow(
      /has no method "nope"/
    )
    expect(() => client.queryKey(other, "one", 1n)).toThrow(/another client/)
    expect(() => client.queryKey({} as typeof canister)).toThrow(
      /made by client.canister/
    )
  })
})

describe("a read's data", () => {
  it("survives dehydration as JSON, nat8 as a number and nat as a bigint", async () => {
    const replica = replicaWith({
      [SHAPES]: serve<shapes.Actor>(shapes.actor, {
        small: ([n]) => n + 1,
        one: ([n]) => n + 1n,
      }),
    })
    const server = clientAs(replica, "anonymous")
    const canister = server.canister<shapes.Actor>(shapes.actor, { id: SHAPES })
    const small = server.queryOptions(canister, "small", 7)
    const one = server.queryOptions(canister, "one", 7n)
    await server.queryClient.fetchQuery(small)
    await server.queryClient.fetchQuery(one)
    const wire = JSON.stringify(dehydrate(server.queryClient))

    const browser = clientAs(replica, "anonymous")
    hydrate(browser.queryClient, JSON.parse(wire))
    expect(browser.queryClient.getQueryData(small.queryKey)).toBe(8)
    expect(browser.queryClient.getQueryData(one.queryKey)).toBe(8n)
    expect(new QueryClient().getQueryData(small.queryKey)).toBeUndefined()
  })
})
