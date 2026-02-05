import { describe, it, expect } from "vitest"
import {
  isPrincipalId,
  isCanisterId,
  isBtcAddress,
  isEthAddress,
  isAccountIdentifier,
  isIsoDate,
  isUrl,
  isImage,
  isUuid,
} from "./helpers"

describe("Helpers", () => {
  describe("isPrincipalId", () => {
    it("should return true for valid principal IDs", () => {
      expect(isPrincipalId("aaaaa-aa")).toBe(true)
      expect(isPrincipalId("2vxsx-fae")).toBe(true)
      expect(isPrincipalId("rrkah-fqaaa-aaaaa-aaaaq-cai")).toBe(true)
    })

    it("should return false for invalid principal IDs", () => {
      expect(isPrincipalId("")).toBe(false) // empty string
      expect(isPrincipalId("invalid-principal")).toBe(false) // contains invalid characters
      expect(isPrincipalId("123456")).toBe(false) // numbers only
      expect(
        isPrincipalId("a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z")
      ).toBe(false) // too long
      expect(isPrincipalId("not-a-valid-principal")).toBe(false) // malformed
    })

    it("should return false for non-string inputs", () => {
      expect(isPrincipalId(123 as any)).toBe(false)
      expect(isPrincipalId(null as any)).toBe(false)
      expect(isPrincipalId(undefined as any)).toBe(false)
      expect(isPrincipalId({} as any)).toBe(false)
    })
  })

  describe("isCanisterId", () => {
    it("should return true for valid canister IDs", () => {
      expect(isCanisterId("rrkah-fqaaa-aaaaa-aaaaq-cai")).toBe(true)
      expect(isCanisterId("ryjl3-tyaaa-aaaaa-aaaba-cai")).toBe(true)
    })

    it("should return false for principal IDs that are not canister IDs", () => {
      expect(isCanisterId("aaaaa-aa")).toBe(false) // too short
      expect(isCanisterId("2vxsx-fae")).toBe(false) // too short
    })

    it("should return false for invalid strings", () => {
      expect(isCanisterId("invalid-canister-id")).toBe(false)
      expect(isCanisterId("rrkah-fqaaa-aaaaa-aaaaq")).toBe(false) // missing -cai
      expect(isCanisterId("rrkah-fqaaa-aaaaa-aaaaq-ca")).toBe(false) // wrong ending
      expect(isCanisterId("")).toBe(false)
    })

    it("should return false for non-string inputs", () => {
      expect(isCanisterId(123 as any)).toBe(false)
      expect(isCanisterId(null as any)).toBe(false)
    })
  })

  describe("isBtcAddress", () => {
    it("should return true for valid Bitcoin addresses", () => {
      // Bech32 mainnet
      expect(isBtcAddress("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4")).toBe(
        true
      )
      // Bech32 testnet
      expect(isBtcAddress("tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx")).toBe(
        true
      )
      // Base58 mainnet
      expect(isBtcAddress("1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2")).toBe(true)
      // Base58 testnet
      expect(isBtcAddress("mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn")).toBe(true)
    })

    it("should return false for invalid Bitcoin addresses", () => {
      expect(isBtcAddress("")).toBe(false)
      expect(isBtcAddress("invalid")).toBe(false)
      expect(isBtcAddress("bc1short")).toBe(false) // too short
      expect(
        isBtcAddress(
          "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4"
        )
      ).toBe(false) // too long
    })

    it("should return false for non-string inputs", () => {
      expect(isBtcAddress(123 as any)).toBe(false)
      expect(isBtcAddress(null as any)).toBe(false)
    })
  })

  describe("isEthAddress", () => {
    it("should return true for valid Ethereum addresses", () => {
      expect(isEthAddress("0x742d35Cc6634C0532925a3b844Bc454e4438f44e")).toBe(
        true
      )
      expect(isEthAddress("0x742d35cc6634c0532925a3b844bc454e4438f44e")).toBe(
        true
      ) // lowercase
      expect(isEthAddress("0x742D35CC6634C0532925A3B844BC454E4438F44E")).toBe(
        true
      ) // uppercase
    })

    it("should return false for invalid Ethereum addresses", () => {
      expect(isEthAddress("")).toBe(false)
      expect(isEthAddress("0x742d35Cc6634C0532925a3b844Bc454e4438f44")).toBe(
        false
      ) // too short
      expect(isEthAddress("0x742d35Cc6634C0532925a3b844Bc454e4438f44ee")).toBe(
        false
      ) // too long
      expect(isEthAddress("742d35Cc6634C0532925a3b844Bc454e4438f44e")).toBe(
        false
      ) // missing 0x
      expect(isEthAddress("0x742d35Cc6634C0532925a3b844Bc454e4438f44g")).toBe(
        false
      ) // invalid char
    })

    it("should return false for non-string inputs", () => {
      expect(isEthAddress(123 as any)).toBe(false)
      expect(isEthAddress(null as any)).toBe(false)
    })
  })

  describe("isAccountIdentifier", () => {
    it("should return true for valid account identifiers", () => {
      expect(
        isAccountIdentifier(
          "a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1"
        )
      ).toBe(true)
      expect(
        isAccountIdentifier(
          "0000000000000000000000000000000000000000000000000000000000000000"
        )
      ).toBe(true)
      expect(
        isAccountIdentifier(
          "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
        )
      ).toBe(true)
    })

    it("should return false for invalid account identifiers", () => {
      expect(isAccountIdentifier("")).toBe(false)
      expect(
        isAccountIdentifier(
          "a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1"
        )
      ).toBe(false) // 63 chars
      expect(
        isAccountIdentifier(
          "a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a"
        )
      ).toBe(false) // 65 chars
      expect(
        isAccountIdentifier(
          "gggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggg"
        )
      ).toBe(false) // invalid chars
    })

    it("should return false for non-string inputs", () => {
      expect(isAccountIdentifier(123 as any)).toBe(false)
      expect(isAccountIdentifier(null as any)).toBe(false)
    })
  })

  describe("isIsoDate", () => {
    it("should return true for valid ISO dates", () => {
      expect(isIsoDate("2023-12-25T10:30:00Z")).toBe(true)
      expect(isIsoDate("2023-12-25T10:30:00.123Z")).toBe(true)
      expect(isIsoDate("2023-12-25T10:30:00+05:30")).toBe(true)
      expect(isIsoDate("2023-12-25T10:30:00-08:00")).toBe(true)
    })

    it("should return false for invalid ISO dates", () => {
      expect(isIsoDate("")).toBe(false)
      expect(isIsoDate("2023-12-25")).toBe(false) // missing time
      expect(isIsoDate("2023-12-25T10:30:00")).toBe(false) // missing timezone
      expect(isIsoDate("invalid-date")).toBe(false)
      expect(isIsoDate("2023-12-25T10:30:00Zextra")).toBe(false) // extra characters
    })

    it("should return false for non-string inputs", () => {
      expect(isIsoDate(123 as any)).toBe(false)
      expect(isIsoDate(null as any)).toBe(false)
    })
  })

  describe("isUrl", () => {
    it("should return true for valid URLs", () => {
      expect(isUrl("http://example.com")).toBe(true)
      expect(isUrl("https://example.com")).toBe(true)
      expect(isUrl("https://example.com/path")).toBe(true)
      expect(isUrl("https://example.com/path?query=value")).toBe(true)
    })

    it("should return false for invalid URLs", () => {
      expect(isUrl("")).toBe(false)
      expect(isUrl("example.com")).toBe(false) // missing protocol
      expect(isUrl("ftp://example.com")).toBe(false) // unsupported protocol
      expect(isUrl("not-a-url")).toBe(false)
    })

    it("should return false for non-string inputs", () => {
      expect(isUrl(123 as any)).toBe(false)
      expect(isUrl(null as any)).toBe(false)
    })
  })

  describe("isImage", () => {
    it("should return true for valid image URLs", () => {
      expect(isImage("https://example.com/image.jpg")).toBe(true)
      expect(isImage("https://example.com/image.jpeg")).toBe(true)
      expect(isImage("https://example.com/image.png")).toBe(true)
      expect(isImage("https://example.com/image.gif")).toBe(true)
      expect(isImage("https://example.com/image.svg")).toBe(true)
    })

    it("should return true for base64 image data", () => {
      expect(
        isImage(
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
        )
      ).toBe(true)
      expect(
        isImage(
          "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/vAA="
        )
      ).toBe(true)
    })

    it("should return false for non-image URLs", () => {
      expect(isImage("https://example.com/document.pdf")).toBe(false)
      expect(isImage("https://example.com/video.mp4")).toBe(false)
      expect(isImage("not-an-image")).toBe(false)
      expect(isImage("")).toBe(false)
    })

    it("should return false for non-string inputs", () => {
      expect(isImage(123 as any)).toBe(false)
      expect(isImage(null as any)).toBe(false)
    })
  })

  describe("isUuid", () => {
    it("should return true for valid UUIDs", () => {
      expect(isUuid("123e4567-e89b-12d3-a456-426614174000")).toBe(true)
      expect(isUuid("123E4567-E89B-12D3-A456-426614174000")).toBe(true) // uppercase
      expect(isUuid("123e4567-e89b-12d3-a456-426614174000")).toBe(true) // lowercase
    })

    it("should return false for invalid UUIDs", () => {
      expect(isUuid("")).toBe(false)
      expect(isUuid("123e4567-e89b-12d3-a456-42661417400")).toBe(false) // too short
      expect(isUuid("123e4567-e89b-12d3-a456-4266141740000")).toBe(false) // too long
      expect(isUuid("123e4567-e89b-12d3-a456-42661417400g")).toBe(false) // invalid char
      expect(isUuid("not-a-uuid")).toBe(false)
    })

    it("should return false for non-string inputs", () => {
      expect(isUuid(123 as any)).toBe(false)
      expect(isUuid(null as any)).toBe(false)
    })
  })
})
