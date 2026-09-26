import { ClientManager } from "@ic-reactor/core"
import { HttpAgent } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { describe, expect, it, vi } from "vitest"
import { MetadataDisplayReactor } from "../../src/metadata-display-reactor.js"
import { MetadataReactor } from "../../src/metadata-reactor.js"
import { CandidFormVisitor } from "../../src/visitor/candid/index.js"
import { FieldVisitor } from "../../src/visitor/arguments/index.js"

/**
 * Candid `text` has no required-ness: "" is a value like any other, and a
 * method may take it (an empty memo, a key prefix, a search that matches
 * everything). Both form visitors rejected it as "Required", so such a call
 * could not be made or replayed from a generated form (#611). Plain text now
 * takes any string. A format read from the label keeps its own check,
 * numbers still need digits, and a func reference still needs its method
 * name.
 */

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

const CANDID = `
  service : {
    note : (text, record { title : text; body : opt text }, vec text) -> (text) query;
    count : (nat) -> ();
  }
`

const EMPTY_NOTE = ["", { title: "", body: "" }, [""]]

describe("CandidFormVisitor (MetadataReactor)", () => {
  it("accepts an empty text wherever text appears", async () => {
    const reactor = new MetadataReactor({
      name: "notes",
      canisterId: "aaaaa-aa",
      clientManager: createMockClientManager(),
      candid: CANDID,
    })
    await reactor.initialize()
    const meta = reactor.getInputMeta("note")!

    expect(meta.schema.safeParse(EMPTY_NOTE).success).toBe(true)
    // The default of a text field is "", so a form left as it is validates.
    expect(meta.args[0].schema.safeParse(meta.defaults[0]).success).toBe(true)
  })

  it("still requires a func reference's method name", () => {
    // The method name is part of the reference, not a text value: a
    // reference with none names nothing to call.
    const visitor = new CandidFormVisitor()
    const meta = visitor.buildValueMeta(IDL.Func([], [], []))
    const reference = meta.args[0]
    if (reference.type !== "tuple") throw new Error("expected a tuple")

    expect(reference.schema.safeParse(["aaaaa-aa", "next"]).success).toBe(true)
    expect(reference.schema.safeParse(["aaaaa-aa", ""]).success).toBe(false)
    expect(reference.fields[1].schema.safeParse("").success).toBe(false)
  })

  it("still requires a number", async () => {
    const reactor = new MetadataReactor({
      name: "notes",
      canisterId: "aaaaa-aa",
      clientManager: createMockClientManager(),
      candid: CANDID,
    })
    await reactor.initialize()

    expect(reactor.getInputMeta("count")!.schema.safeParse([""]).success).toBe(
      false
    )
  })
})

describe("FieldVisitor (MetadataDisplayReactor)", () => {
  it("accepts an empty plain text and sends it", async () => {
    const reactor = new MetadataDisplayReactor({
      name: "notes",
      canisterId: "aaaaa-aa",
      clientManager: createMockClientManager(),
      candid: CANDID,
    })
    await reactor.initialize()
    const meta = reactor.getInputMeta("note")!

    const parsed = meta.schema.safeParse(EMPTY_NOTE)
    expect(parsed.success).toBe(true)

    const func = reactor
      .getServiceInterface()
      ._fields.find(([name]) => name === "note")![1] as IDL.FuncClass
    const executeQuery = vi
      .spyOn(
        reactor as unknown as {
          executeQuery: (...args: unknown[]) => Promise<Uint8Array>
        },
        "executeQuery"
      )
      .mockResolvedValue(IDL.encode(func.retTypes, [""]))

    await reactor.callMethod({
      functionName: "note",
      args: parsed.data as never,
    })

    const [, argBytes] = executeQuery.mock.calls[0]
    expect(IDL.decode(func.argTypes, argBytes as Uint8Array)).toEqual([
      "",
      { title: "", body: [""] },
      [""],
    ])
  })

  it("keeps the check of a format read from the label", () => {
    const visitor = new FieldVisitor()
    const record = IDL.Record({
      email: IDL.Text,
      website: IDL.Text,
      canister_id: IDL.Text,
      eth_address: IDL.Text,
    })
    const meta = visitor.visitFunc(IDL.Func([record], [], []), "save")
    const field = meta.args[0]
    if (field.type !== "record") throw new Error("expected a record")
    const schemaOf = (label: string) =>
      field.fields.find((f) => f.label === label)!.schema

    expect(schemaOf("email").safeParse("").success).toBe(false)
    expect(schemaOf("website").safeParse("").success).toBe(false)
    expect(schemaOf("canister_id").safeParse("").success).toBe(false)
    expect(schemaOf("eth_address").safeParse("").success).toBe(false)
  })

  it("still requires a func reference's method name", () => {
    const visitor = new FieldVisitor()
    const meta = visitor.visitFunc(
      IDL.Func([IDL.Func([], [], ["query"])], [], []),
      "subscribe"
    )
    const reference = meta.args[0]
    if (reference.type !== "tuple") throw new Error("expected a tuple")

    expect(reference.schema.safeParse(["aaaaa-aa", "next"]).success).toBe(true)
    expect(reference.schema.safeParse(["aaaaa-aa", ""]).success).toBe(false)
    expect(reference.fields[1].schema.safeParse("").success).toBe(false)
  })

  it("still requires a number", async () => {
    const reactor = new MetadataDisplayReactor({
      name: "notes",
      canisterId: "aaaaa-aa",
      clientManager: createMockClientManager(),
      candid: CANDID,
    })
    await reactor.initialize()

    expect(reactor.getInputMeta("count")!.schema.safeParse([""]).success).toBe(
      false
    )
  })
})
