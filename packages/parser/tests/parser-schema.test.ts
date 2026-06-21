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
    const parsed = JSON.parse(parser.parseDid(candid))

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
    const parsed = JSON.parse(parser.parseDid(candid))

    // Types in Candid are returned by the parser's env.
    // They are usually sorted alphabetically or in insertion order. Let's find each type by name.
    const profileType = parsed.types.find((t: any) => t.name === "Profile")
    const resultType = parsed.types.find((t: any) => t.name === "Result")

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
    const parsed = JSON.parse(parser.parseDid(candid))

    const coordType = parsed.types.find((t: any) => t.name === "Coordinates")
    const nestedType = parsed.types.find((t: any) => t.name === "Nested")

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
})
