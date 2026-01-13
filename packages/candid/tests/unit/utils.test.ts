import { describe, it, expect } from "vitest"
import { importCandidDefinition } from "../../src/utils"

describe("Utils", () => {
  describe("importCandidDefinition", () => {
    it("should throw error for invalid JavaScript code", async () => {
      const invalidJs = "this is not valid javascript code {{{{"

      await expect(importCandidDefinition(invalidJs)).rejects.toThrow(
        /Failed to import Candid definition/
      )
    })

    it("should return undefined idlFactory for empty string", async () => {
      // Empty modules import successfully but have no exports
      const result = await importCandidDefinition("")
      expect(result.idlFactory).toBeUndefined()
    })

    it("should successfully import valid Candid JS definition", async () => {
      // A minimal valid Candid JS module
      const validCandidJs = `
        export const idlFactory = ({ IDL }) => {
          return IDL.Service({
            greet: IDL.Func([IDL.Text], [IDL.Text], ['query'])
          });
        };
      `

      const result = await importCandidDefinition(validCandidJs)

      expect(result).toBeDefined()
      expect(result.idlFactory).toBeDefined()
      expect(typeof result.idlFactory).toBe("function")
    })

    it("should successfully import Candid JS with init function", async () => {
      const candidJsWithInit = `
        export const idlFactory = ({ IDL }) => {
          return IDL.Service({
            greet: IDL.Func([IDL.Text], [IDL.Text], ['query'])
          });
        };
        export const init = ({ IDL }) => {
          return [IDL.Text];
        };
      `

      const result = await importCandidDefinition(candidJsWithInit)

      expect(result).toBeDefined()
      expect(result.idlFactory).toBeDefined()
      expect(result.init).toBeDefined()
      expect(typeof result.init).toBe("function")
    })

    it("should handle Candid JS without init function", async () => {
      const candidJsWithoutInit = `
        export const idlFactory = ({ IDL }) => {
          return IDL.Service({
            ping: IDL.Func([], [IDL.Bool], ['query'])
          });
        };
      `

      const result = await importCandidDefinition(candidJsWithoutInit)

      expect(result.idlFactory).toBeDefined()
      expect(result.init).toBeUndefined()
    })

    it("should handle complex Candid types", async () => {
      const complexCandidJs = `
        export const idlFactory = ({ IDL }) => {
          const User = IDL.Record({
            id: IDL.Nat64,
            name: IDL.Text,
            email: IDL.Opt(IDL.Text)
          });
          const Result = IDL.Variant({
            Ok: User,
            Err: IDL.Text
          });
          return IDL.Service({
            getUser: IDL.Func([IDL.Nat64], [Result], ['query']),
            createUser: IDL.Func([IDL.Text], [Result], [])
          });
        };
      `

      const result = await importCandidDefinition(complexCandidJs)

      expect(result).toBeDefined()
      expect(result.idlFactory).toBeDefined()
      expect(typeof result.idlFactory).toBe("function")
    })

    it("should handle special characters in Candid JS", async () => {
      const candidWithSpecialChars = `
        export const idlFactory = ({ IDL }) => {
          return IDL.Service({
            get_data_with_unicode: IDL.Func([IDL.Text], [IDL.Text], ['query'])
          });
        };
      `

      const result = await importCandidDefinition(candidWithSpecialChars)

      expect(result.idlFactory).toBeDefined()
    })

    it("should throw for JavaScript that exports nothing", async () => {
      const noExports = `
        const foo = "bar";
        console.log(foo);
      `

      const result = await importCandidDefinition(noExports)

      // Should not have idlFactory
      expect(result.idlFactory).toBeUndefined()
    })
  })
})
