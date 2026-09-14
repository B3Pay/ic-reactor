import { describe, it, expect } from "vitest"
import { normalizeCandidInterface } from "../../src/utils.js"

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

  it("should throw an error for malformed candid shorthand", () => {
    const invalidInput = "(text, nat64 -> (bool) query"

    expect(() => {
      normalizeCandidInterface(invalidInput)
    }).toThrow("Malformed candid interface")
  })

  describe("comments", () => {
    // Candid allows `//` and `/* */` comments anywhere, and the parser ignores
    // them. The scans here did not, so delimiters, semicolons or `type` inside
    // a comment were read as code.
    it("ignores delimiters inside a comment", () => {
      expect(
        normalizeCandidInterface("// accepts (text\n(text) -> (text) query")
      ).toBe('service : { "dynamic_method": (text) -> (text) query; }')
      expect(
        normalizeCandidInterface("/* { unclosed */ (text) -> (text) query")
      ).toBe('service : { "dynamic_method": (text) -> (text) query; }')
    })

    it("drops a trailing line comment instead of commenting out the service", () => {
      expect(
        normalizeCandidInterface("(text) -> (text) query; // the symbol")
      ).toBe('service : { "dynamic_method": (text) -> (text) query; }')
    })

    it("does not read a commented-out type as a declaration", () => {
      expect(normalizeCandidInterface("// type Old = nat;\n(text) -> ()")).toBe(
        'service : { "dynamic_method": (text) -> (); }'
      )
    })

    it("finds the end of a type whose body holds a comment", () => {
      const result = normalizeCandidInterface(
        "type A = record { /* ; } */ x : nat };\n(A) -> ()"
      )
      expect(result).toMatch(/^type A = record \{\s+x : nat \};\n/)
      expect(result).toMatch(
        /service : \{ "dynamic_method": \(A\) -> \(\); \}$/
      )
    })

    it("keeps comment markers inside a quoted name", () => {
      expect(
        normalizeCandidInterface(
          'type R = record { "http://x" : text };\n(R) -> ()'
        )
      ).toBe(
        'type R = record { "http://x" : text };\nservice : { "dynamic_method": (R) -> (); }'
      )
    })

    it("rejects an unterminated block comment", () => {
      expect(() =>
        normalizeCandidInterface("(text) -> (text) /* query")
      ).toThrow("Malformed candid interface")
    })
  })
})
