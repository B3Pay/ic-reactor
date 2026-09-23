import { ClientManager, uint8ArrayToHex } from "@ic-reactor/core"
import { HttpAgent } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { Principal } from "@icp-sdk/core/principal"
import { describe, expect, it, vi } from "vitest"
import { MetadataDisplayReactor } from "../../src/metadata-display-reactor.js"
import { MetadataReactor } from "../../src/metadata-reactor.js"
import type { RecordField } from "../../src/visitor/arguments/index.js"
import type { CandidFormMetadata } from "../../src/visitor/candid/index.js"
import type {
  FuncRecordNode,
  RecordNode,
  ResolvedNode,
  VariantNode,
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

/** A resolved field by name. Typed `fields.toString` would read as a method. */
const fieldOf = (fields: Record<string, unknown>, name: string) =>
  fields[name] as { raw?: unknown; value?: unknown }

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

describe("a variant tag named __proto__", () => {
  const CANDID = `service : { get : () -> (variant { "__proto__" : nat; other }) query }`

  it.each(REACTORS)(
    "%s: is an option, and a value with that tag resolves",
    async (_name, Reactor) => {
      const reactor = await create(Reactor, CANDID)
      const output = reactor.getOutputMeta("get" as never)!

      const node = output.returns[0] as VariantNode
      expect(hasOwn(node.options, "__proto__")).toBe(true)
      // `__proto__` carries a nat, so this is not a variant of null options.
      expect(node.displayType).toBe("variant")

      const resolved = output.resolve(own([["__proto__", 5n]]) as never)
        .results[0] as ResolvedNode<"variant">
      expect(resolved.selected).toBe("__proto__")
      expect(resolved.selectedValue).toMatchObject({ value: "5", raw: 5n })
    }
  )

  it("resolves from a reply that IDL.decode returned", async () => {
    // Unlike a record field, the tag survives IDL.decode, which builds a
    // variant value with a computed key.
    const reactor = await create(MetadataDisplayReactor, CANDID)
    const func = reactor.getServiceInterface().fieldsAsObject()["get"]
    vi.spyOn(
      reactor as unknown as { executeQuery: () => Promise<Uint8Array> },
      "executeQuery"
    ).mockResolvedValue(IDL.encode(func.retTypes, [own([["__proto__", 5n]])]))

    const result = await reactor.callMethod({ functionName: "get" as never })
    const resolved = result.results[0] as ResolvedNode<"variant">
    expect(resolved.selected).toBe("__proto__")
    expect(resolved.selectedValue).toMatchObject({ value: "5" })
  })

  it.each(REACTORS)(
    "%s: a tag the variant does not have is not found, whatever its name",
    async (_name, Reactor) => {
      const reactor = await create(
        Reactor,
        "service : { get : () -> (variant { a : nat; b }) query }"
      )
      const output = reactor.getOutputMeta("get" as never)!

      for (const tag of INHERITED) {
        expect(() => output.resolve(own([[tag, 5n]]) as never), tag).toThrow(
          `Option "${tag}" not found`
        )
      }
    }
  )
})

describe("a record field named __proto__, hydrated from Candid args", () => {
  const RECORD = `record { "__proto__" : text; other : text }`

  /** The hydrated values. */
  const hydrated = ({ hydration }: CandidFormMetadata) => {
    expect(hydration.status).toBe("hydrated")
    return (hydration.status === "hydrated" ? hydration.values : []) as Array<
      Record<string, unknown>
    >
  }

  it("gives the field's value, for a method and for a value type", async () => {
    // IDL.decode drops the field (#634, U5), so toFormValue read
    // Object.prototype and hydrated "[object Object]".
    const reactor = (await create(
      MetadataReactor,
      `service : { echo : (${RECORD}) -> () }`
    )) as MetadataReactor
    const func = reactor.getServiceInterface().fieldsAsObject()["echo"]
    const candidArgsHex = uint8ArrayToHex(
      IDL.encode(func.argTypes, [
        own([
          ["__proto__", "x"],
          ["other", "y"],
        ]),
      ])
    )

    const built = [
      await reactor.buildForMethod("echo" as never, { candidArgsHex }),
      await reactor.buildForValueType(RECORD, { candidArgsHex }),
    ]
    for (const metadata of built) {
      const [value] = hydrated(metadata)
      expect(hasOwn(value, "__proto__")).toBe(true)
      expect(value["__proto__"]).toBe("x")
      expect(value["other"]).toBe("y")
    }
  })

  it("gives the value at any depth: in a recursive type, an opt and a variant", async () => {
    const reactor = (await create(
      MetadataReactor,
      `type Tree = record { "__proto__" : nat; children : vec Tree };
       service : {
         put : (Tree, opt variant { v : record { "__proto__" : record { a : text } } }) -> ()
       }`
    )) as MetadataReactor
    const func = reactor.getServiceInterface().fieldsAsObject()["put"]
    const leaf = own([
      ["__proto__", 2n],
      ["children", []],
    ])
    const tree = own([
      ["__proto__", 1n],
      ["children", [leaf]],
    ])
    const wrapped = [{ v: own([["__proto__", { a: "deep" }]]) }]
    const candidArgsHex = uint8ArrayToHex(
      IDL.encode(func.argTypes, [tree, wrapped])
    )

    const [root, option] = hydrated(
      await reactor.buildForMethod("put" as never, { candidArgsHex })
    )

    expect(root["__proto__"]).toBe("1")
    const [child] = root["children"] as Array<Record<string, unknown>>
    expect(hasOwn(child, "__proto__")).toBe(true)
    expect(child["__proto__"]).toBe("2")

    expect(option["_type"]).toBe("v")
    const record = option["v"] as Record<string, unknown>
    expect(hasOwn(record, "__proto__")).toBe(true)
    expect(record["__proto__"]).toEqual({ a: "deep" })
  })
})

describe("a field named after an Object.prototype member, left out of a hand-built value", () => {
  // Only `__proto__` has to be an own property. Anything else counts wherever
  // the value holds it, except on Object.prototype, as core's display codecs
  // read labels since #483.
  const NAMES = ["toString", "constructor", "valueOf", "hasOwnProperty"]

  it.each(REACTORS)(
    "%s: a record field resolves as missing, like any left-out field",
    async (_name, Reactor) => {
      const reactor = await create(
        Reactor,
        `service : {
          get : () -> (record {
            "toString" : opt text;
            "constructor" : opt text;
            "valueOf" : opt text;
            "hasOwnProperty" : opt text;
            plain : opt text;
          }) query
        }`
      )
      const output = reactor.getOutputMeta("get" as never)!
      const { fields } = output.resolve({} as never)
        .results[0] as ResolvedNode<"record">

      for (const name of [...NAMES, "plain"]) {
        expect(fieldOf(fields, name).raw, name).toBeUndefined()
        expect(fieldOf(fields, name).value, name).toBeNull()
      }
    }
  )

  it.each(REACTORS)(
    "%s: a variant payload resolves as missing, like any left-out payload",
    async (_name, Reactor) => {
      const reactor = await create(
        Reactor,
        `service : {
          get : () -> (variant {
            "toString" : text;
            "constructor" : text;
            "valueOf" : text;
            "hasOwnProperty" : text;
            plain : text;
          }) query
        }`
      )
      const output = reactor.getOutputMeta("get" as never)!

      for (const name of [...NAMES, "plain"]) {
        const resolved = output.resolve({ _type: name } as never)
          .results[0] as ResolvedNode<"variant">
        expect(resolved.selected, name).toBe(name)
        expect(resolved.selectedValue.raw, name).toBeUndefined()
        expect(resolved.selectedValue.value, name).toBeUndefined()
      }
    }
  )

  it("a value's own field, or one from its class, still counts", async () => {
    const reactor = await create(
      MetadataDisplayReactor,
      `service : { get : () -> (record { "toString" : text; plain : text }) query }`
    )
    const output = reactor.getOutputMeta("get" as never)!
    class Reply {
      get plain() {
        return "from a getter"
      }
    }
    const value = Object.assign(new Reply(), { toString: "own" })

    const { fields } = output.resolve(value as never)
      .results[0] as ResolvedNode<"record">
    expect(fieldOf(fields, "toString").value).toBe("own")
    expect(fieldOf(fields, "plain").value).toBe("from a getter")
  })
})
