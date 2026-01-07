import { describe, it, expect } from "vitest"

// Import everything from the main index to verify exports
import * as CandidPackage from "../../src/index"

describe("Package Exports", () => {
  describe("CandidAdapter", () => {
    it("should export CandidAdapter class", () => {
      expect(CandidPackage.CandidAdapter).toBeDefined()
      expect(typeof CandidPackage.CandidAdapter).toBe("function")
    })

    it("should be constructible", () => {
      const mockClientManager = {
        agent: {
          isLocal: () => false,
          query: () => Promise.resolve({}),
          call: () => Promise.resolve({}),
        },
        isLocal: false,
        subscribe: () => () => {},
      }

      const adapter = new CandidPackage.CandidAdapter({
        clientManager: mockClientManager as any,
      })

      expect(adapter).toBeInstanceOf(CandidPackage.CandidAdapter)
    })
  })

  describe("Constants", () => {
    it("should export DEFAULT_IC_DIDJS_ID", () => {
      expect(CandidPackage.DEFAULT_IC_DIDJS_ID).toBeDefined()
      expect(typeof CandidPackage.DEFAULT_IC_DIDJS_ID).toBe("string")
    })

    it("should export DEFAULT_LOCAL_DIDJS_ID", () => {
      expect(CandidPackage.DEFAULT_LOCAL_DIDJS_ID).toBeDefined()
      expect(typeof CandidPackage.DEFAULT_LOCAL_DIDJS_ID).toBe("string")
    })
  })

  describe("Utils", () => {
    it("should export noop function", () => {
      expect(CandidPackage.noop).toBeDefined()
      expect(typeof CandidPackage.noop).toBe("function")
    })

    it("should export importCandidDefinition function", () => {
      expect(CandidPackage.importCandidDefinition).toBeDefined()
      expect(typeof CandidPackage.importCandidDefinition).toBe("function")
    })
  })

  describe("All expected exports are present", () => {
    const expectedExports = [
      // Classes
      "CandidAdapter",
      // Constants
      "DEFAULT_IC_DIDJS_ID",
      "DEFAULT_LOCAL_DIDJS_ID",
      // Utils
      "noop",
      "importCandidDefinition",
    ]

    expectedExports.forEach((exportName) => {
      it(`should export ${exportName}`, () => {
        expect(
          exportName in CandidPackage,
          `${exportName} should be exported`
        ).toBe(true)
      })
    })
  })

  describe("No unexpected exports", () => {
    it("should only export expected items", () => {
      const actualExports = Object.keys(CandidPackage)

      // All exports should be documented
      const knownExports = [
        "CandidAdapter",
        "CandidReactor",
        "DEFAULT_IC_DIDJS_ID",
        "DEFAULT_LOCAL_DIDJS_ID",
        "noop",
        "importCandidDefinition",
      ]

      actualExports.forEach((exp) => {
        expect(knownExports.includes(exp), `Unexpected export: ${exp}`).toBe(
          true
        )
      })
    })
  })
})
