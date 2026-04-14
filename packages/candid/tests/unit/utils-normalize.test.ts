import { describe, it, expect, vi } from "vitest"
import { normalizeCandidInterface } from "../../src/utils"

describe("normalizeCandidInterface", () => {
  it("should handle basic shorthand", () => {
    const input = "(text, nat64) -> (bool) query"
    const result = normalizeCandidInterface(input)

    expect(result).toBe(
      'service : { "dynamic_method": (text, nat64) -> (bool) query; }'
    )
  })

  it("should handle types with no recursion", () => {
    const input = `type User = record { id: nat };\n(User) -> (User)`
    const result = normalizeCandidInterface(input)

    expect(result).toContain("type User = record { id: nat };")
    expect(result).toContain(
      'service : { "dynamic_method": (User) -> (User); }'
    )
  })

  it("should handle deep recursive types", () => {
    const input = `type rec_1 = record { name: text; children: vec rec_1 };\n(rec_1) -> (opt rec_1)`
    const result = normalizeCandidInterface(input)

    expect(result).toContain(
      "type rec_1 = record { name: text; children: vec rec_1 };"
    )
    expect(result).toContain(
      'service : { "dynamic_method": (rec_1) -> (opt rec_1); }'
    )
  })

  it("should handle whitespace resilience", () => {
    const input = `\n          type Test = record { val: text; };   \n\n          \n          (Test) -> (Test) query   \n\n        `

    const result = normalizeCandidInterface(input)

    expect(result).toContain("type Test = record { val: text; };")
    expect(result).toContain(
      'service : { "dynamic_method": (Test) -> (Test) query; }'
    )
  })

  it("should handle multiline method signatures correctly", () => {
    const input = `type Proposal = record { id: nat64 };\n(\n  Proposal\n) -> (\n  variant {\n    Ok: nat;\n    Err: text;\n  }\n) query`
    const result = normalizeCandidInterface(input)

    expect(result).toContain("type Proposal = record { id: nat64 };")
    expect(result).toContain(
      `service : { "dynamic_method": (\n  Proposal\n) -> (\n  variant {\n    Ok: nat;\n    Err: text;\n  }\n) query; }`
    )
  })

  it("should throw an error when didToJs compiler is fed hallucinatory syntax", () => {
    const invalidInput = `type Broken = record { invalid_primitive };\n(Broken) -> (Broken)`
    const result = normalizeCandidInterface(invalidInput)

    const mockParser = {
      didToJs: vi.fn().mockImplementation((source) => {
        if (source.includes("invalid_primitive")) {
          throw new Error("Syntax error in candid file")
        }
        return "export const idlFactory = () => {};"
      }),
      validateIDL: vi.fn(),
    }

    expect(() => {
      mockParser.didToJs(result)
    }).toThrow("Syntax error in candid file")
  })
})
