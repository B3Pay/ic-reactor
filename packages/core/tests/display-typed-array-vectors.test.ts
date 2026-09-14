import { describe, it, expect, vi } from "vitest"
import { QueryClient } from "@tanstack/query-core"
import { IDL } from "@icp-sdk/core/candid"
import type { ActorMethod } from "@icp-sdk/core/agent"
import { ClientManager } from "../src/client.js"
import { DisplayReactor } from "../src/display-reactor.js"
import { didToDisplayCodec } from "../src/display/index.js"
import type { ReactorArgs, ReactorReturnOk } from "../src/types/reactor.js"

/**
 * `IDL.decode` returns a typed array, not an `Array`, for every fixed-width
 * integer vector other than blob. `vec nat64` decodes to a `BigUint64Array`,
 * `vec int32` to an `Int32Array`, and so on. The display codec only mapped
 * values that passed `Array.isArray`, so these left the DisplayReactor exactly
 * as decoded. A `vec nat64` result still held bigints, although the README
 * maps `nat64` to `string`, and `JSON.stringify` throws on it. The narrower
 * vectors stayed typed arrays, which serialise as index-keyed objects.
 *
 * NNS governance's `get_neuron_ids` returns a `vec nat64`.
 */

// Declared exactly as @ic-reactor/parser's didToTs emits these types.
interface TestActor {
  get_neuron_ids: ActorMethod<[], BigUint64Array | bigint[]>
  deltas: ActorMethod<[], BigInt64Array | bigint[]>
  ports: ActorMethod<[], Uint32Array | number[]>
  offsets: ActorMethod<[], Int8Array | number[]>
  neuron_list: ActorMethod<[], { neuron_ids: BigUint64Array | bigint[] }>
  maybe_ids: ActorMethod<[], [] | [BigUint64Array | bigint[]]>
  list_neurons: ActorMethod<[BigUint64Array | bigint[]], bigint>
}

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({
    get_neuron_ids: IDL.Func([], [IDL.Vec(IDL.Nat64)], ["query"]),
    deltas: IDL.Func([], [IDL.Vec(IDL.Int64)], ["query"]),
    ports: IDL.Func([], [IDL.Vec(IDL.Nat32)], ["query"]),
    offsets: IDL.Func([], [IDL.Vec(IDL.Int8)], ["query"]),
    neuron_list: IDL.Func(
      [],
      [IDL.Record({ neuron_ids: IDL.Vec(IDL.Nat64) })],
      ["query"]
    ),
    maybe_ids: IDL.Func([], [IDL.Opt(IDL.Vec(IDL.Nat64))], ["query"]),
    list_neurons: IDL.Func([IDL.Vec(IDL.Nat64)], [IDL.Nat], ["query"]),
  })

// Type-level pins. The typecheck gate runs tsc over tests, so these fail it if
// the mapping regresses. The display type of a typed-array vector used to go
// through the variant branch and come out as an unusable object type that
// rejected the value the runtime should return.
type IsExact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
const _nat64Result: IsExact<
  ReactorReturnOk<TestActor, "get_neuron_ids", "display">,
  string[]
> = true
const _nat32Result: IsExact<
  ReactorReturnOk<TestActor, "ports", "display">,
  number[]
> = true
const _nestedResult: IsExact<
  ReactorReturnOk<TestActor, "neuron_list", "display">,
  { neuron_ids: string[] }
> = true
const _nat64Args: IsExact<
  ReactorArgs<TestActor, "list_neurons", "display">,
  [string[]]
> = true
void [_nat64Result, _nat32Result, _nestedResult, _nat64Args]

const makeDisplay = () =>
  new DisplayReactor<TestActor>({
    clientManager: new ClientManager({ queryClient: new QueryClient() }),
    name: "governance",
    canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
    idlFactory,
  })

const replyWith = (reactor: object, type: IDL.Type, value: unknown) =>
  vi
    .spyOn(reactor as any, "executeQuery")
    .mockResolvedValue(IDL.encode([type], [value]))

describe("DisplayReactor fixed-width integer vectors", () => {
  it("returns a vec nat64 result as decimal strings", async () => {
    const reactor = makeDisplay()
    replyWith(reactor, IDL.Vec(IDL.Nat64), [1n, 18446744073709551615n])

    const ids = await reactor.callMethod({ functionName: "get_neuron_ids" })

    expect(Array.isArray(ids)).toBe(true)
    expect(ids).toEqual(["1", "18446744073709551615"])
    // The display layer is the JSON-safe one.
    expect(JSON.stringify(ids)).toBe('["1","18446744073709551615"]')
  })

  it("returns a vec int64 result as decimal strings", async () => {
    const reactor = makeDisplay()
    replyWith(reactor, IDL.Vec(IDL.Int64), [-5n, 7n])

    await expect(
      reactor.callMethod({ functionName: "deltas" })
    ).resolves.toEqual(["-5", "7"])
  })

  it("returns narrower integer vectors as plain number arrays", async () => {
    const ports = makeDisplay()
    replyWith(ports, IDL.Vec(IDL.Nat32), [80, 4294967295])
    const portList = await ports.callMethod({ functionName: "ports" })
    expect(Array.isArray(portList)).toBe(true)
    expect(portList).toEqual([80, 4294967295])
    expect(JSON.stringify(portList)).toBe("[80,4294967295]")

    const offsets = makeDisplay()
    replyWith(offsets, IDL.Vec(IDL.Int8), [-128, 127])
    await expect(
      offsets.callMethod({ functionName: "offsets" })
    ).resolves.toEqual([-128, 127])
  })

  it("converts the vector wherever it sits in the result", async () => {
    const record = makeDisplay()
    replyWith(record, IDL.Record({ neuron_ids: IDL.Vec(IDL.Nat64) }), {
      neuron_ids: [42n],
    })
    await expect(
      record.callMethod({ functionName: "neuron_list" })
    ).resolves.toEqual({ neuron_ids: ["42"] })

    const optional = makeDisplay()
    replyWith(optional, IDL.Opt(IDL.Vec(IDL.Nat64)), [[3n]])
    await expect(
      optional.callMethod({ functionName: "maybe_ids" })
    ).resolves.toEqual(["3"])
  })

  it("caches the converted value, not the typed array", async () => {
    const reactor = makeDisplay()
    replyWith(reactor, IDL.Vec(IDL.Nat64), [9n])

    await reactor.fetchQuery({ functionName: "get_neuron_ids" })

    expect(reactor.getQueryData({ functionName: "get_neuron_ids" })).toEqual([
      "9",
    ])
  })

  it("still encodes display strings back to a vec nat64 argument", async () => {
    // Guards the other direction. The arguments path was already correct.
    const reactor = makeDisplay()
    const query = replyWith(reactor, IDL.Nat, 2n)

    await expect(
      reactor.callMethod({
        functionName: "list_neurons",
        args: [["1", "2"]],
      })
    ).resolves.toBe("2")

    const [, arg] = query.mock.calls[0] as [string, Uint8Array]
    const [sent] = IDL.decode([IDL.Vec(IDL.Nat64)], arg)
    expect(Array.from(sent as unknown as BigUint64Array)).toEqual([1n, 2n])
  })
})

describe("display codec on the value IDL.decode produces", () => {
  it("maps a decoded typed array element by element", () => {
    const type = IDL.Vec(IDL.Nat64)
    const [decoded] = IDL.decode([type], IDL.encode([type], [[5n, 6n]]))
    // Pins the premise. The decoder does hand back a typed array.
    expect(decoded).toBeInstanceOf(BigUint64Array)

    expect(didToDisplayCodec(type).asDisplay(decoded as never)).toEqual([
      "5",
      "6",
    ])
  })
})
