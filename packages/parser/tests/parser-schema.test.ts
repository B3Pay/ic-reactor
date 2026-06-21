import * as parser from "../dist/nodejs"
import { describe, it, expect } from "vitest"

describe("Candid Schema Parser (parseDid)", () => {
  it("should fail on invalid Candid syntax", () => {
    expect(() => parser.parseDid("invalid candid")).toThrow()
  })

  it("should parse simple candid service with basic types", () => {
    const candid = `
      service : {
        greet : (text) -> (text) query;
        update_profile : (text, nat64) -> (bool);
      }
    `
    const parsed = parser.parseDid(candid)

    expect(parsed).toEqual({
      types: [],
      service: {
        methods: [
          {
            name: "greet",
            mode: "query",
            args: [{ kind: "text" }],
            returns: [{ kind: "text" }],
          },
          {
            name: "update_profile",
            mode: "update",
            args: [{ kind: "text" }, { kind: "nat64" }],
            returns: [{ kind: "bool" }],
          },
        ],
      },
    })
  })

  it("should parse custom type declarations", () => {
    const candid = `
      type Profile = record {
        name : text;
        age : nat8;
        preferences : vec text;
        avatar : blob;
      };

      type Result = variant {
        Ok : Profile;
        Err : text;
      };

      service : {
        getProfile : (principal) -> (opt Profile) query;
        updateProfile : (Profile) -> (Result);
      }
    `
    const parsed = parser.parseDid(candid)

    // Types in Candid are returned by the parser's env.
    // They are usually sorted alphabetically or in insertion order. Let's find each type by name.
    const profileType = parsed.types.find(
      (t: any) => t.name === "Profile"
    ) as parser.CandidTypeDeclaration
    const resultType = parsed.types.find(
      (t: any) => t.name === "Result"
    ) as parser.CandidTypeDeclaration

    expect(profileType).toBeDefined()
    expect(profileType.type).toEqual({
      kind: "record",
      fields: [
        { name: "age", type: { kind: "nat8" } },
        { name: "name", type: { kind: "text" } },
        { name: "preferences", type: { kind: "vec", type: { kind: "text" } } },
        { name: "avatar", type: { kind: "blob" } },
      ],
    })

    expect(resultType).toBeDefined()
    expect(resultType.type).toEqual({
      kind: "variant",
      fields: [
        { name: "Ok", type: { kind: "reference", name: "Profile" } },
        { name: "Err", type: { kind: "text" } },
      ],
    })

    expect(parsed.service).toEqual({
      methods: [
        {
          name: "getProfile",
          mode: "query",
          args: [{ kind: "principal" }],
          returns: [
            { kind: "opt", type: { kind: "reference", name: "Profile" } },
          ],
        },
        {
          name: "updateProfile",
          mode: "update",
          args: [{ kind: "reference", name: "Profile" }],
          returns: [{ kind: "reference", name: "Result" }],
        },
      ],
    })
  })

  it("should parse tuples, options, and unnamed records", () => {
    const candid = `
      type Coordinates = record { float64; float64 };
      type Nested = record { name: text; 0: nat32; 1: bool };

      service : {
        getCoordinates : () -> (Coordinates) query;
        getNested : () -> (Nested) query;
      }
    `
    const parsed = parser.parseDid(candid)

    const coordType = parsed.types.find(
      (t: any) => t.name === "Coordinates"
    ) as parser.CandidTypeDeclaration
    const nestedType = parsed.types.find(
      (t: any) => t.name === "Nested"
    ) as parser.CandidTypeDeclaration

    expect(coordType).toBeDefined()
    expect(coordType.type).toEqual({
      kind: "tuple",
      types: [{ kind: "float64" }, { kind: "float64" }],
    })

    // Nested record has named fields and unnamed fields (index 0, 1)
    // The parser checks if fields are unnamed consecutive indices. If not, it falls back to a normal record.
    // Here we have "name", "0", "1". Since "name" is not a consecutive u32 index starting at 0,
    // it should be parsed as a normal record with fields.
    expect(nestedType).toBeDefined()
    expect(nestedType.type).toEqual({
      kind: "record",
      fields: [
        { name: "0", type: { kind: "nat32" } },
        { name: "1", type: { kind: "bool" } },
        { name: "name", type: { kind: "text" } },
      ],
    })
  })

  it("should preserve doc comments and JSDoc validation tags as metadata", () => {
    const candid = `
      /// Account that receives tokens.
      type Account = record {
        /// Owner principal.
        owner : principal;

        /// Human-readable display name.
        /// @minLength 2 Name is too short
        /// @maxLength 32 Name is too long
        name : text;

        /// Contact email.
        /// @format email Invalid email address
        email : text;
      };

      /// Ledger service.
      service : {
        /// Return an account balance.
        /// @minimum 0 Balance cannot be negative
        balance : (Account) -> (nat) query;
      }
    `

    const parsed = parser.parseDid(candid)
    const accountType = parsed.types.find(
      (t: any) => t.name === "Account"
    ) as parser.CandidTypeDeclaration
    if (accountType.type.kind !== "record") {
      throw new Error("Expected record type")
    }
    const nameField = accountType.type.fields.find(
      (f: any) => f.name === "name"
    )
    const emailField = accountType.type.fields.find(
      (f: any) => f.name === "email"
    )

    expect(accountType.metadata).toEqual({
      description: "Account that receives tokens.",
      docs: ["Account that receives tokens."],
    })

    if (!nameField?.metadata || !emailField?.metadata?.validation?.format) {
      throw new Error(
        "Expected name and email fields to have metadata and validation format"
      )
    }

    expect(nameField.metadata).toEqual({
      description: "Human-readable display name.",
      docs: [
        "Human-readable display name.",
        "@minLength 2 Name is too short",
        "@maxLength 32 Name is too long",
      ],
      validation: {
        minLength: { value: "2", message: "Name is too short" },
        maxLength: { value: "32", message: "Name is too long" },
      },
    })
    expect(emailField.metadata.validation.format).toEqual({
      type: "email",
      message: "Invalid email address",
    })

    if (!parsed.service?.metadata || !parsed.service.methods[0]?.metadata) {
      throw new Error("Expected service and method metadata to be defined")
    }

    expect(parsed.service.metadata.description).toBe("Ledger service.")
    expect(parsed.service.methods[0].metadata).toEqual({
      description: "Return an account balance.",
      docs: [
        "Return an account balance.",
        "@minimum 0 Balance cannot be negative",
      ],
      validation: {
        minimum: { value: "0", message: "Balance cannot be negative" },
      },
    })
  })

  it("should preserve metadata for inline service method payload fields", () => {
    const candid = `
      service : {
        save : (
          record {
            /// Contact email.
            /// @format email
            email : text;
          }
        ) -> (
          variant {
            /// Save succeeded.
            Ok : record {
              /// Stored profile identifier.
              /// @minLength 2
              id : text;
            };
            Err : text;
          }
        );
      }
    `

    const parsed = parser.parseDid(candid)
    const method = parsed.service?.methods.find((m: any) => m.name === "save")
    const arg = method?.args[0]
    const ret = method?.returns[0]

    if (arg?.kind !== "record" || ret?.kind !== "variant") {
      throw new Error("Expected inline record argument and variant return")
    }

    const emailField = arg.fields.find((f: any) => f.name === "email")
    expect(emailField?.metadata).toEqual({
      description: "Contact email.",
      docs: ["Contact email.", "@format email"],
      validation: {
        format: {
          type: "email",
          message: "Must be a valid email address",
        },
      },
    })

    const okField = ret.fields.find((f: any) => f.name === "Ok")
    expect(okField?.metadata).toEqual({
      description: "Save succeeded.",
      docs: ["Save succeeded."],
    })

    const idField = okField?.type.fields.find((f: any) => f.name === "id")
    expect(idField?.metadata).toEqual({
      description: "Stored profile identifier.",
      docs: ["Stored profile identifier.", "@minLength 2"],
      validation: {
        minLength: {
          value: "2",
          message: "Must be at least 2 characters",
        },
      },
    })
  })

  it("should add default validation messages when doc tags omit them", () => {
    const candid = `
      type Profile = record {
        /// @minLength 2
        /// @maxLength 32
        name : text;

        /// @format email
        email : text;
      };

      service : {
        /// @minimum 0
        balance : () -> (nat) query;
      }
    `

    const parsed = parser.parseDid(candid)
    const profileType = parsed.types.find(
      (t: any) => t.name === "Profile"
    ) as parser.CandidTypeDeclaration

    if (profileType.type.kind !== "record") {
      throw new Error("Expected record type")
    }

    const nameField = profileType.type.fields.find(
      (f: any) => f.name === "name"
    )
    const emailField = profileType.type.fields.find(
      (f: any) => f.name === "email"
    )

    if (
      !nameField?.metadata?.validation ||
      !emailField?.metadata?.validation?.format
    ) {
      throw new Error("Expected validation metadata to be present")
    }

    expect(nameField.metadata.validation.minLength).toEqual({
      value: "2",
      message: "Must be at least 2 characters",
    })
    expect(nameField.metadata.validation.maxLength).toEqual({
      value: "32",
      message: "Must be at most 32 characters",
    })
    expect(emailField.metadata.validation.format).toEqual({
      type: "email",
      message: "Must be a valid email address",
    })
    expect(parsed.service?.methods[0]?.metadata?.validation?.minimum).toEqual({
      value: "0",
      message: "Must be at least 0",
    })
  })
})
