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
      console.log(actualExports)

      // All exports should be documented
      const knownExports = [
        "CandidAdapter",
        "ResultFieldVisitor",
        "FieldVisitor",
        "MetadataError",
        "extractAndSortArgs",
        "normalizeFormState",
        "convertNanoToDate",
        "convertToCycle",
        "convertStringToNumber",
        "validateNumberError",
        "validateError",
        "isQuery",
        "isUrl",
        "isImage",
        "isUuid",
        "isCanisterId",
        "isBtcAddress",
        "isEthAddress",
        "isAccountIdentifier",
        "isIsoDate",
        "uint8ArrayToHexString",
        "DEFAULT_IC_DIDJS_ID",
        "DEFAULT_LOCAL_DIDJS_ID",
        "importCandidDefinition",
        "CandidReactor",
        "CandidDisplayReactor",
        "MetadataDisplayReactor",
        // Type guard utilities
        "isFieldType",
        "isCompoundField",
        "isPrimitiveField",
        "hasChildFields",
        "hasOptions",
        "checkTextFormat",
        "checkNumberFormat",
        "formatLabel",
      ]

      actualExports.forEach((exp) => {
        expect(knownExports.includes(exp), `Unexpected export: ${exp}`).toBe(
          true
        )
      })
    })
  })
})
