import * as parser from "../dist/nodejs"
import { describe, it, expect } from "vitest"

const OLD_DID = "service : { balance : (nat) -> (nat) query }"
const WITH_TRANSFER =
  "service : { balance : (nat) -> (nat) query; transfer : (nat) -> () }"

describe("verifyCompatibility(oldDid, newDid)", () => {
  it("accepts an identical service", () => {
    expect(parser.verifyCompatibility(OLD_DID, OLD_DID)).toBe(true)
  })

  it("accepts an upgrade that adds a method", () => {
    expect(parser.verifyCompatibility(OLD_DID, WITH_TRANSFER)).toBe(true)
  })

  it("returns false for an upgrade that removes a method", () => {
    expect(parser.verifyCompatibility(OLD_DID, "service : {}")).toBe(false)
  })

  it("returns false for an upgrade that changes an argument type incompatibly", () => {
    const newDid = "service : { balance : (text) -> (nat) query }"

    expect(parser.verifyCompatibility(OLD_DID, newDid)).toBe(false)
  })

  it("compares the service behind a service class", () => {
    // Ledgers declare `service : (LedgerArg) -> Service`.
    const oldDid = `type Arg = record { minter : principal }; service : (Arg) -> { balance : (nat) -> (nat) query }`
    const newDid = `type Arg = record { minter : principal }; service : (Arg) -> { balance : (nat) -> (nat) query; transfer : (nat) -> () }`

    expect(parser.verifyCompatibility(oldDid, newDid)).toBe(true)
    expect(parser.verifyCompatibility(newDid, oldDid)).toBe(false)
  })

  it("throws for a source that does not parse", () => {
    expect(() => parser.verifyCompatibility(OLD_DID, "service : {")).toThrow(
      /Candid parser error/
    )
    expect(() => parser.verifyCompatibility("service : {", OLD_DID)).toThrow(
      /Candid parser error/
    )
  })

  it("throws for a source that declares no service", () => {
    expect(() => parser.verifyCompatibility(OLD_DID, "type T = nat;")).toThrow(
      "The new interface declares no service."
    )
  })
})

describe("verifyCompatability (deprecated)", () => {
  // It keeps its original behavior. The new interface comes first, and an
  // incompatible pair throws.
  it("returns true when the first interface is a compatible upgrade of the second", () => {
    expect(parser.verifyCompatability(WITH_TRANSFER, OLD_DID)).toBe(true)
    expect(parser.verifyCompatability(OLD_DID, "service : {}")).toBe(true)
  })

  it("throws when the first interface is not a compatible upgrade of the second", () => {
    expect(() => parser.verifyCompatability(OLD_DID, WITH_TRANSFER)).toThrow(
      "Method transfer is only in the expected type"
    )
  })
})
