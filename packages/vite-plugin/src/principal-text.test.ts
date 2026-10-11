import { Principal } from "@icp-sdk/core/principal"
import { describe, expect, it } from "vitest"
import { isPrincipalText } from "./principal-text.js"

/** Whether `Principal.fromText` of `@icp-sdk/core` takes `text`. */
function takes(text: string): boolean {
  try {
    Principal.fromText(text)
    return true
  } catch {
    return false
  }
}

describe("isPrincipalText", () => {
  it("takes a canister's ID and the management canister's, and nothing else spelled near them", () => {
    for (const text of [
      "ryjl3-tyaaa-aaaaa-aaaba-cai",
      "mqygn-kiaaa-aaaar-qaadq-cai",
      "aaaaa-aa",
      "2vxsx-fae",
    ]) {
      expect([text, isPrincipalText(text)]).toEqual([text, true])
    }
    for (const text of [
      "",
      "ryjl3-tyaaa-aaaaa-aaaba-caj",
      "RYJL3-TYAAA-AAAAA-AAABA-CAI",
      "ryjl3tyaaaaaaaaaaabacai",
      "ryjl3-tyaaa-aaaaa-aaaba-ca",
      "aaaaaaa",
      "the ledger",
      // `Principal.fromText` reads this JSON form too; a canisterId is not
      // written so.
      '{"__principal__":"aaaaa-aa"}',
    ]) {
      expect([text, isPrincipalText(text)]).toEqual([text, false])
    }
  })

  // Every principal of 0 to 29 bytes, its text, and texts one edit away
  // from it: the two decide each alike.
  it("decides as Principal.fromText does", () => {
    let seed = 7
    const random = () =>
      (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
    const characters = "abcdefghijklmnopqrstuvwxyz234567-ABZ0189 "
    for (let round = 0; round < 3000; round += 1) {
      const bytes = Uint8Array.from({ length: round % 30 }, () =>
        Math.floor(random() * 256)
      )
      const text = Principal.fromUint8Array(bytes).toText()
      const edited = [...text]
      edited[Math.floor(random() * edited.length)] =
        characters[Math.floor(random() * characters.length)]
      for (const candidate of [
        text,
        edited.join(""),
        text.toUpperCase(),
        text.replace(/-/g, ""),
        text.slice(0, -1),
        `${text}a`,
        `-${text}`,
      ]) {
        expect([candidate, isPrincipalText(candidate)]).toEqual([
          candidate,
          takes(candidate),
        ])
      }
    }
  })
})
