import { describe, expect, it } from "vitest"
import {
  BUILT_IN_JSDOC_FORMAT_TYPES,
  generateCodecDeclarations,
} from "./renderer"
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
    expect(code).not.toContain("export const idlFactory")
    expect(code).not.toContain("export type _SERVICE")
    expect(code).not.toContain("export const manifest")
    expect(code).not.toContain("IDL.")
    expect(code).not.toContain("init")
  })

  it("can emit compatibility service aliases when requested", () => {
    const schema: CandidSchema = {
      types: [],
      service: {
        methods: [
          {
            name: "ping",
            mode: "query",
            args: [],
            returns: [{ kind: "text" }],
          },
        ],
      },
    }

    const code = generateCodecDeclarations(schema, {
      serviceExportName: "backend",
      includeCompatibilityExports: true,
    })

    expect(code).toContain("export const backend = c.service({")
    expect(code).toContain("export const idlFactory = backend.idlFactory")
    expect(code).toContain("export type _SERVICE = c.ServiceOf<typeof backend>")
    expect(code).toContain("export const manifest = backend.manifest()")
  })

  it("falls back to _SERVICE when neither canisterName nor serviceExportName is provided", () => {
    const schema: CandidSchema = {
      types: [
        {
          name: "canister",
          type: {
            kind: "record",
            fields: [{ name: "name", type: { kind: "text" } }],
          },
        },
      ],
      service: {
        methods: [
          {
            name: "get",
            mode: "query",
            args: [],
            returns: [{ kind: "reference", name: "canister" }],
          },
        ],
      },
    }

    const code = generateCodecDeclarations(schema)

    expect(code).toContain("export const canister = c.record({")
    expect(code).toContain("export const _SERVICE = c.service({")
    expect(code).toContain("get: c.query([], canister),")
  })

  it("derives SCREAMING_SNAKE_CASE service export from canisterName", () => {
    const schema: CandidSchema = {
      types: [],
      service: {
        methods: [
          {
            name: "ping",
            mode: "query",
            args: [],
            returns: [{ kind: "text" }],
          },
        ],
      },
    }

    const code = generateCodecDeclarations(schema, {
      canisterName: "my_backend",
    })

    expect(code).toContain("export const MY_BACKEND = c.service({")
  })

  it("converts hyphens to underscores for canisterName", () => {
    const schema: CandidSchema = {
      types: [],
      service: {
        methods: [
          {
            name: "ping",
            mode: "query",
            args: [],
            returns: [{ kind: "text" }],
          },
        ],
      },
    }

    const code = generateCodecDeclarations(schema, {
      canisterName: "internet-identity",
    })

    expect(code).toContain("export const INTERNET_IDENTITY = c.service({")
  })

  it("appends _SERVICE suffix when canisterName collides with a declared type", () => {
    const schema: CandidSchema = {
      types: [
        {
          name: "BACKEND",
          type: {
            kind: "record",
            fields: [{ name: "id", type: { kind: "text" } }],
          },
        },
      ],
      service: {
        methods: [
          {
            name: "get",
            mode: "query",
            args: [],
            returns: [{ kind: "reference", name: "BACKEND" }],
          },
        ],
      },
    }

    const code = generateCodecDeclarations(schema, {
      canisterName: "backend",
    })

    expect(code).toContain("export const BACKEND = c.record({")
    expect(code).toContain("export const BACKEND_SERVICE = c.service({")
  })

  it("serviceExportName takes priority over canisterName", () => {
    const schema: CandidSchema = {
      types: [],
      service: {
        methods: [
          {
            name: "ping",
            mode: "query",
            args: [],
            returns: [{ kind: "text" }],
          },
        ],
      },
    }

    const code = generateCodecDeclarations(schema, {
      canisterName: "backend",
      serviceExportName: "myCustomName",
    })

    expect(code).toContain("export const myCustomName = c.service({")
    expect(code).not.toContain("BACKEND")
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

  it("renders multiple method returns as separate return codecs", () => {
    const schema: CandidSchema = {
      types: [],
      service: {
        methods: [
          {
            name: "stats",
            mode: "query",
            args: [],
            returns: [{ kind: "text" }, { kind: "nat64" }],
          },
        ],
      },
    }

    const code = generateCodecDeclarations(schema)

    expect(code).toContain("stats: c.query([], [c.text(), c.nat64()]),")
    expect(code).not.toContain("c.tuple([c.text(), c.nat64()])")
  })

  it("renders docs and validation tags as codec metadata", () => {
    const schema: CandidSchema = {
      types: [
        {
          name: "Profile",
          metadata: {
            description: "A user profile.",
            docs: ["A user profile."],
          },
          type: {
            kind: "record",
            fields: [
              {
                name: "email",
                type: { kind: "text" },
                metadata: {
                  description: "Contact email.",
                  docs: ["Contact email.", "@format email"],
                  validation: {
                    format: {
                      type: "email",
                    },
                  },
                },
              },
              {
                name: "name",
                type: { kind: "text" },
                metadata: {
                  description: "Display name.",
                  docs: ["Display name.", "@minLength 2"],
                  validation: {
                    minLength: { value: "2" },
                  },
                },
              },
            ],
          },
        },
      ],
      service: {
        methods: [
          {
            name: "save",
            mode: "update",
            args: [{ kind: "reference", name: "Profile" }],
            returns: [],
            metadata: {
              description: "Save a profile.",
              docs: ["Save a profile."],
            },
          },
        ],
        metadata: {
          description: "Profile service.",
          docs: ["Profile service."],
        },
      },
    }

    const code = generateCodecDeclarations(schema)

    expect(code).toContain("export const Profile = c.record({")
    expect(code).toContain('}).describe("A user profile.")')
    expect(code).not.toContain(
      'describe("A user profile.").meta({"docs":["A user profile."]})'
    )
    expect(code).toContain('email: c.email().describe("Contact email."),')
    expect(code).toContain(
      'name: c.text().describe("Display name.").meta({"docs":["Display name.","@minLength 2"],"validation":{"minLength":{"value":"2","message":"Must be at least 2 characters"}}}),'
    )
    expect(code).toContain("c.service({")
    expect(code).toContain('}).describe("Profile service.")')
    expect(code).not.toContain(
      'describe("Profile service.").meta({"docs":["Profile service."]})'
    )
    expect(code).toContain(
      'save: c.update([Profile]).describe("Save a profile.")'
    )
    expect(code).not.toContain(
      'describe("Save a profile.").meta({"docs":["Save a profile."]})'
    )
  })

  it("lets custom format definitions override built-in defaults", () => {
    const schema: CandidSchema = {
      types: [
        {
          name: "Profile",
          type: {
            kind: "record",
            fields: [
              {
                name: "email",
                type: { kind: "text" },
                metadata: {
                  validation: {
                    format: {
                      type: "email",
                    },
                  },
                },
              },
            ],
          },
        },
      ],
      service: null,
    }

    const code = generateCodecDeclarations(schema, {
      customJSDocFormatTypes: {
        email: {
          regex: "^[^@]+@[^@]+$",
          errorMessage: "Configured email error",
        },
      },
    })

    expect(code).toContain(
      'email: c.text().meta({"validation":{"format":{"type":"email","regex":"^[^@]+@[^@]+$","jsonSchemaFormat":"email","errorMessage":"Configured email error"}}}),'
    )
  })

  it("includes Zod-compatible built-in string format names", () => {
    expect(Object.keys(BUILT_IN_JSDOC_FORMAT_TYPES).sort()).toEqual(
      [
        "base64",
        "base64url",
        "cidrv4",
        "cidrv6",
        "cuid",
        "cuid2",
        "date",
        "date-time",
        "datetime",
        "duration",
        "email",
        "emoji",
        "guid",
        "httpsUrl",
        "ipv4",
        "ipv6",
        "mac",
        "nanoid",
        "time",
        "ulid",
        "uri",
        "url",
        "uuid",
      ].sort()
    )
  })

  it("renders built-in text format helpers instead of inline metadata", () => {
    const schema: CandidSchema = {
      types: [
        {
          name: "WithFormats",
          type: {
            kind: "record",
            fields: [
              {
                name: "createdAt",
                type: { kind: "text" },
                metadata: {
                  validation: { format: { type: "date-time" } },
                },
              },
              {
                name: "avatar",
                type: { kind: "text" },
                metadata: {
                  validation: { format: { type: "base64" } },
                },
              },
              {
                name: "homepage",
                type: { kind: "text" },
                metadata: {
                  validation: { format: { type: "uri" } },
                },
              },
            ],
          },
        },
      ],
      service: null,
    }

    const code = generateCodecDeclarations(schema)

    expect(code).toContain("createdAt: c.dateTime(),")
    expect(code).toContain("avatar: c.base64(),")
    expect(code).toContain("homepage: c.uri(),")
  })

  it("uses built-in format helpers with compact message overrides", () => {
    const schema: CandidSchema = {
      types: [
        {
          name: "Profile",
          type: {
            kind: "record",
            fields: [
              {
                name: "id",
                type: { kind: "text" },
                metadata: {
                  description: "Public profile identifier.",
                  docs: ["Public profile identifier.", "@format uuid UUID"],
                  validation: {
                    format: {
                      type: "uuid",
                      message: "UUID",
                    },
                  },
                },
              },
            ],
          },
        },
      ],
      service: null,
    }

    const code = generateCodecDeclarations(schema)

    expect(code).toContain(
      'id: c.uuid("UUID").describe("Public profile identifier."),'
    )
    expect(code).not.toContain(".meta(")
    expect(code).not.toContain('"docs"')
    expect(code).not.toContain('"regex"')
    expect(code).not.toContain('"jsonSchemaFormat"')
  })
})
