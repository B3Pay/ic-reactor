import { describe, it, expect } from "vitest"
import {
  DEFAULT_IC_DIDJS_ID,
  DEFAULT_LOCAL_DIDJS_ID,
} from "../../src/constants"

describe("Constants", () => {
  describe("DEFAULT_IC_DIDJS_ID", () => {
    it("should be a valid canister ID string", () => {
      expect(DEFAULT_IC_DIDJS_ID).toBe("a4gq6-oaaaa-aaaab-qaa4q-cai")
    })

    it("should be a non-empty string", () => {
      expect(typeof DEFAULT_IC_DIDJS_ID).toBe("string")
      expect(DEFAULT_IC_DIDJS_ID.length).toBeGreaterThan(0)
    })

    it("should end with -cai suffix", () => {
      expect(DEFAULT_IC_DIDJS_ID).toMatch(/-cai$/)
    })
  })

  describe("DEFAULT_LOCAL_DIDJS_ID", () => {
    it("should be a valid local canister ID string", () => {
      expect(DEFAULT_LOCAL_DIDJS_ID).toBe("bd3sg-teaaa-aaaaa-qaaba-cai")
    })

    it("should be a non-empty string", () => {
      expect(typeof DEFAULT_LOCAL_DIDJS_ID).toBe("string")
      expect(DEFAULT_LOCAL_DIDJS_ID.length).toBeGreaterThan(0)
    })

    it("should end with -cai suffix", () => {
      expect(DEFAULT_LOCAL_DIDJS_ID).toMatch(/-cai$/)
    })
  })

  describe("Constants differentiation", () => {
    it("should have different IDs for IC and local environments", () => {
      expect(DEFAULT_IC_DIDJS_ID).not.toBe(DEFAULT_LOCAL_DIDJS_ID)
    })
  })
})
