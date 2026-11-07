import { createHash } from "node:crypto"

export { toHex } from "../candid/hex.ts"

/** SHA-256 of a text's UTF-8 bytes, as lower-case hex. */
export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex")
}
