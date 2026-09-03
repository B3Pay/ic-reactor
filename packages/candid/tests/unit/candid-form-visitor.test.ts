import { IDL } from "@icp-sdk/core/candid"
import { describe, expect, it } from "vitest"
import { CandidFormVisitor } from "../../src/visitor/candid/index.js"
import type {
  FormFieldNode,
  FormVectorField,
} from "../../src/visitor/candid/types.js"

/**
 * `createItemField` is a closure consumers call after traversal, when the
 * visitor's name stack is empty (or, on the `MetadataReactor` instance every
 * reactor shares, while it is busy with something else). The path it builds
 * has to be the vector's own path plus the index, whatever the stack holds.
 */
describe("CandidFormVisitor createItemField", () => {
  const visitor = new CandidFormVisitor()

  const vectorAt = (
    meta: { args: FormFieldNode[] },
    pick: (arg: FormFieldNode) => FormFieldNode = (arg) => arg
  ) => {
    const field = pick(meta.args[0])
    if (field.type !== "vector")
      throw new Error(`expected a vector, got ${field.type}`)
    return field as FormVectorField
  }

  const childOf = (field: FormFieldNode, key: string): FormFieldNode => {
    if (field.type !== "record")
      throw new Error(`expected a record, got ${field.type}`)
    const child = field.fields.find((f) => f.label === key)
    if (!child) throw new Error(`no field ${key}`)
    return child
  }

  it("names a root vector's items under the argument's path", () => {
    const meta = visitor.buildFunctionMeta(
      IDL.Func([IDL.Vec(IDL.Text)], [], []),
      "addTags"
    )
    const vec = vectorAt(meta)

    expect(vec.name).toBe("[0]")
    expect(vec.itemField.name).toBe("[0][0]")
    // Not "[3]", which is the path of argument 3.
    expect(vec.createItemField(3).name).toBe("[0][3]")
  })

  it("keeps the parent path for a vector nested in a record", () => {
    const meta = visitor.buildFunctionMeta(
      IDL.Func([IDL.Record({ tags: IDL.Vec(IDL.Text) })], [], []),
      "update"
    )
    const vec = vectorAt(meta, (arg) => childOf(arg, "tags"))

    expect(vec.name).toBe("[0].tags")
    expect(vec.createItemField(2).name).toBe("[0].tags[2]")
  })

  it("names an item's nested fields under the item", () => {
    const meta = visitor.buildFunctionMeta(
      IDL.Func(
        [IDL.Record({ posts: IDL.Vec(IDL.Record({ title: IDL.Text })) })],
        [],
        []
      ),
      "publish"
    )
    const vec = vectorAt(meta, (arg) => childOf(arg, "posts"))

    const item = vec.createItemField(1)
    expect(item.name).toBe("[0].posts[1]")
    expect(childOf(item, "title").name).toBe("[0].posts[1].title")
  })

  it("chains through a vector of vectors", () => {
    const meta = visitor.buildFunctionMeta(
      IDL.Func([IDL.Vec(IDL.Vec(IDL.Nat))], [], []),
      "matrix"
    )
    const rows = vectorAt(meta)

    const row = rows.createItemField(1)
    expect(row.name).toBe("[0][1]")
    if (row.type !== "vector") throw new Error("expected a vector row")
    expect(row.createItemField(2).name).toBe("[0][1][2]")
  })

  it("builds the item's path from the vector, not from whatever is on the stack", () => {
    // Simulate the shared visitor being mid-way through another traversal:
    // a caller invoking createItemField from inside a visit of a different
    // type must still get the captured vector path.
    const meta = visitor.buildFunctionMeta(
      IDL.Func([IDL.Record({ tags: IDL.Vec(IDL.Text) })], [], []),
      "update"
    )
    const vec = vectorAt(meta, (arg) => childOf(arg, "tags"))

    let seenName: string | undefined
    class Probe extends IDL.TextClass {
      override accept<D, R>(v: IDL.Visitor<D, R>, d: D): R {
        seenName = vec.createItemField(4).name
        return super.accept(v, d)
      }
    }
    visitor.buildFunctionMeta(
      IDL.Func([IDL.Record({ x: new Probe() })], [], []),
      "other"
    )

    expect(seenName).toBe("[0].tags[4]")
  })

  it("keeps a custom label", () => {
    const meta = visitor.buildFunctionMeta(
      IDL.Func([IDL.Vec(IDL.Text)], [], []),
      "addTags"
    )
    const item = vectorAt(meta).createItemField(2, { label: "Second tag" })

    expect(item.label).toBe("Second tag")
    expect(item.name).toBe("[0][2]")
  })
})
