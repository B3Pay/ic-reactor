import { ClientManager } from "@ic-reactor/core"
import { HttpAgent } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { Principal } from "@icp-sdk/core/principal"
import { describe, expect, it, vi } from "vitest"
import { MetadataDisplayReactor } from "../../src/metadata-display-reactor.js"
import { MetadataReactor } from "../../src/metadata-reactor.js"
import type { RecordField } from "../../src/visitor/arguments/index.js"
import type {
  FuncRecordNode,
  RecordNode,
  ResolvedNode,
} from "../../src/visitor/returns/index.js"

/**
 * Names that every object inherits from Object.prototype. The metadata
 * reactors looked a method up on a plain object, so getInputMeta("toString")
 * returned Object.prototype.toString, and getInputMeta("__proto__") returned
 * Object.prototype, instead of undefined. The visitors built those objects
 * and records by assignment, and assigning to `__proto__` sets the prototype,
 * so a method or record field of that name went missing.
 */
const INHERITED = [
  "constructor",
  "toString",
  "__proto__",
  "hasOwnProperty",
  "valueOf",
]

function createMockClientManager(): ClientManager {
  const agent = HttpAgent.createSync({ host: "https://ic0.app" })
  return {
    agent,
    registerCanisterId: () => {},
    subscribe: () => () => {},
    queryClient: {
      invalidateQueries: () => Promise.resolve(),
      ensureQueryData: () => Promise.resolve(undefined),
      getQueryData: () => undefined,
    },
  } as unknown as ClientManager
}

const REACTORS = [
  ["MetadataReactor", MetadataReactor],
  ["MetadataDisplayReactor", MetadataDisplayReactor],
] as const

async function create(
  Reactor: typeof MetadataReactor | typeof MetadataDisplayReactor,
  candid: string
) {
  const reactor = new Reactor({
    name: "test",
    canisterId: "aaaaa-aa",
    clientManager: createMockClientManager(),
    candid,
  })
  await reactor.initialize()
  return reactor
}

/** A record value holding `entries` as own properties, `__proto__` too. */
const own = (entries: Array<[string, unknown]>) => Object.fromEntries(entries)

const hasOwn = (value: object, key: string) =>
  Object.prototype.hasOwnProperty.call(value, key)

describe("metadata lookups by method name", () => {
  it.each(REACTORS)(
    "%s: getInputMeta and getOutputMeta return undefined for a name the service lacks",
    async (_name, Reactor) => {
      const reactor = await create(
        Reactor,
        "service : { greet : (text) -> (text) query }"
      )

      for (const name of INHERITED) {
        expect(reactor.getInputMeta(name as never), name).toBeUndefined()
        expect(reactor.getOutputMeta(name as never), name).toBeUndefined()
      }
      expect(reactor.getInputMeta("greet" as never)).toBeDefined()
    }
  )

  it.each(REACTORS)(
    "%s: finds methods named __proto__, toString and constructor, also after registerMethod",
    async (_name, Reactor) => {
      const reactor = await create(
        Reactor,
        `service : {
          "__proto__" : () -> (nat) query;
          "toString" : () -> (text) query;
          "constructor" : () -> (text) query;
        }`
      )
      const names = ["__proto__", "toString", "constructor"]
      const expectAll = () => {
        for (const name of names) {
          expect(reactor.getInputMeta(name as never)?.functionName, name).toBe(
            name
          )
          expect(reactor.getOutputMeta(name as never)?.functionName, name).toBe(
            name
          )
          expect(hasOwn(reactor.getAllInputMeta()!, name), name).toBe(true)
          expect(hasOwn(reactor.getAllOutputMeta()!, name), name).toBe(true)
        }
      }

      expectAll()
      // registerMethod adds to the metadata with an object spread, which
      // copies own properties only.
      await reactor.registerMethod({
        functionName: "added",
        candid: "() -> (text) query",
      })
      expectAll()

      const func = reactor.getServiceInterface().fieldsAsObject()["__proto__"]
      vi.spyOn(
        reactor as unknown as { executeQuery: () => Promise<Uint8Array> },
        "executeQuery"
      ).mockResolvedValue(IDL.encode(func.retTypes, [5n]))
      const result = await reactor.callMethod({
        functionName: "__proto__" as never,
      })
      expect(result.results[0]).toMatchObject({ value: "5" })
    }
  )
})

describe("a record field named __proto__", () => {
  const RECORD = `record { "__proto__" : text; other : text }`
  const CANDID = `service : { echo : (${RECORD}) -> (${RECORD}) query }`

  it.each(REACTORS)(
    "%s: is in the defaults and the schema",
    async (_name, Reactor) => {
      const reactor = await create(Reactor, CANDID)
      const input = reactor.getInputMeta("echo" as never)!
      const record = input.args[0] as RecordField

      const defaults = input.defaults[0] as Record<string, unknown>
      expect(hasOwn(defaults, "__proto__")).toBe(true)
      expect(defaults["__proto__"]).toBe("")

      // The shape declares the field. Zod 4 skips a declared `__proto__` key
      // when it parses, for either visitor, so this is all a schema can hold.
      const shape = (record.schema as unknown as { shape: object }).shape
      expect(hasOwn(shape, "__proto__")).toBe(true)
      expect(hasOwn(shape, "other")).toBe(true)
    }
  )

  it.each(REACTORS)(
    "%s: is in the result tree and resolves from a value that holds it",
    async (_name, Reactor) => {
      const reactor = await create(Reactor, CANDID)
      const output = reactor.getOutputMeta("echo" as never)!

      const node = output.returns[0] as RecordNode
      expect(hasOwn(node.fields, "__proto__")).toBe(true)

      const resolved = output.resolve(
        own([
          ["__proto__", "x"],
          ["other", "y"],
        ]) as never
      )
      const fields = (resolved.results[0] as ResolvedNode<"record">).fields
      expect(hasOwn(fields, "__proto__")).toBe(true)
      expect(fields["__proto__"]).toMatchObject({ value: "x", raw: "x" })
      expect(fields["other"]).toMatchObject({ value: "y" })
    }
  )

  it("resolves to no value, not Object.prototype, when IDL.decode dropped it", async () => {
    // @icp-sdk/core's record decoder assigns each field, so a field named
    // __proto__ is not kept (#575). The reply below has one.
    const reactor = await create(MetadataDisplayReactor, CANDID)
    const func = reactor.getServiceInterface().fieldsAsObject()["echo"]
    const value = own([
      ["__proto__", "x"],
      ["other", "y"],
    ])
    vi.spyOn(
      reactor as unknown as { executeQuery: () => Promise<Uint8Array> },
      "executeQuery"
    ).mockResolvedValue(IDL.encode(func.retTypes, [value]))

    const result = await reactor.callMethod({
      functionName: "echo" as never,
      args: [value] as never,
    })
    const fields = (result.results[0] as ResolvedNode<"record">).fields
    expect(hasOwn(fields, "__proto__")).toBe(true)
    expect(fields["__proto__"].raw).toBeUndefined()
    expect(fields["__proto__"].value).toBeUndefined()
    expect(fields["other"]).toMatchObject({ value: "y" })
  })

  it("is an argument of a func record, and in its defaultArgs", async () => {
    // The callback takes the type of the one other field, so that field is
    // the argument, as in ICRC-3's archived_blocks.
    const reactor = await create(
      MetadataDisplayReactor,
      `service : {
        get : () -> (record {
          "__proto__" : nat;
          callback : func (nat) -> (text) query;
        }) query
      }`
    )
    const output = reactor.getOutputMeta("get" as never)!
    const node = output.returns[0] as FuncRecordNode
    expect(hasOwn(node.argFields, "__proto__")).toBe(true)

    const resolved = output.resolve(
      own([
        ["__proto__", 5n],
        ["callback", [Principal.fromText("aaaaa-aa"), "fetch"]],
      ]) as never
    ).results[0] as ResolvedNode<"funcRecord">
    expect(hasOwn(resolved.argFields, "__proto__")).toBe(true)
    expect(resolved.methodName).toBe("fetch")
    expect(resolved.defaultArgs).toEqual(["5"])
  })
})
