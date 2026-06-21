import { describe, expect, it } from "vitest"
import { generateCodecDeclarations } from "./renderer"
import type { CandidSchema } from "@ic-reactor/parser"

describe("Codec Declarations Generator", () => {
  it("generates declarations for simple services and types", () => {
    const schema: CandidSchema = {
      types: [
        {
          name: "Profile",
          type: {
            kind: "record",
            fields: [
              { name: "name", type: { kind: "text" } },
              { name: "age", type: { kind: "nat8" } },
            ],
          },
        },
      ],
      service: {
        methods: [
          {
            name: "getProfile",
            mode: "query",
            args: [{ kind: "principal" }],
            returns: [{ kind: "reference", name: "Profile" }],
          },
        ],
      },
    }

    const code = generateCodecDeclarations(schema, "myService")

    expect(code).toContain('import { c } from "@ic-reactor/cod"')
    expect(code).toContain("export const Profile = c.record({")
    expect(code).toContain("name: c.text(),")
    expect(code).toContain("age: c.nat8(),")
    expect(code).toContain("export type Profile = c.infer<typeof Profile>")
    expect(code).toContain("export const myService = c.service({")
    expect(code).toContain("getProfile: c.query([c.principal()], Profile),")
    expect(code).toContain("export const idlFactory = myService.idlFactory")
    expect(code).toContain(
      "export type _SERVICE = c.ServiceOf<typeof myService>"
    )
    expect(code).toContain("export const manifest = myService.manifest()")
    expect(code).not.toContain("IDL.")
    expect(code).not.toContain("init")
  })

  it("sorts type declarations topologically", () => {
    const schema: CandidSchema = {
      types: [
        {
          name: "Result",
          type: {
            kind: "variant",
            fields: [
              { name: "Ok", type: { kind: "reference", name: "Profile" } },
              { name: "Err", type: { kind: "text" } },
            ],
          },
        },
        {
          name: "Profile",
          type: {
            kind: "record",
            fields: [{ name: "name", type: { kind: "text" } }],
          },
        },
      ],
      service: null,
    }

    const code = generateCodecDeclarations(schema)
    const profileIdx = code.indexOf("export const Profile")
    const resultIdx = code.indexOf("export const Result")

    expect(profileIdx).toBeGreaterThan(0)
    expect(resultIdx).toBeGreaterThan(0)
    expect(profileIdx).toBeLessThan(resultIdx)
  })

  it("rejects recursive references until c.recursive is implemented", () => {
    const schema: CandidSchema = {
      types: [
        {
          name: "Node",
          type: {
            kind: "record",
            fields: [
              { name: "value", type: { kind: "text" } },
              {
                name: "next",
                type: {
                  kind: "opt",
                  type: { kind: "reference", name: "Node" },
                },
              },
            ],
          },
        },
      ],
      service: null,
    }

    expect(() => generateCodecDeclarations(schema)).toThrow(
      "Recursive Candid types are not supported yet: Node -> Node"
    )
  })

  it("falls back to reserved for unsupported Candid type categories", () => {
    const schema: CandidSchema = {
      types: [
        {
          name: "WithFunc",
          type: {
            kind: "record",
            fields: [{ name: "callback", type: { kind: "func" } }],
          },
        },
      ],
      service: null,
    }

    const code = generateCodecDeclarations(schema)

    expect(code).toContain(
      "callback: /* c.func is not supported */ c.reserved(),"
    )
  })

  it("uses no-return query/update codecs without undefined casts", () => {
    const schema: CandidSchema = {
      types: [],
      service: {
        methods: [
          {
            name: "status",
            mode: "query",
            args: [],
            returns: [],
          },
          {
            name: "fireAndForget",
            mode: "update",
            args: [{ kind: "text" }],
            returns: [],
          },
        ],
      },
    }

    const code = generateCodecDeclarations(schema)

    expect(code).toContain("status: c.query([]),")
    expect(code).toContain("fireAndForget: c.update([c.text()]),")
    expect(code).not.toContain("undefined as any")
  })
})
