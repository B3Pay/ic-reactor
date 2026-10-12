import { useEffect, useMemo, useState } from "react"
import { sha256Hex, toHex } from "../lib/hex.ts"

/**
 * The SHA-256 of `bytes` as hex, computed after mount (Web Crypto is async),
 * so the server and the first browser render agree on `undefined`
 * ("computing…"). The bytes' content, not their identity, decides a
 * recompute.
 */
export function useSha256(bytes: Uint8Array): string | undefined {
  const hex = useMemo(() => toHex(bytes), [bytes])
  const [digest, setDigest] = useState<{ hex: string; sha256: string }>()
  useEffect(() => {
    let current = true
    sha256Hex(bytes).then(
      (sha256) => {
        if (current) setDigest({ hex, sha256 })
      },
      () => {
        // No Web Crypto (an insecure context): the size and bytes still show.
      }
    )
    return () => {
      current = false
    }
    // `bytes` is read through `hex`: the same content is the same digest.
  }, [hex])
  return digest?.hex === hex ? digest.sha256 : undefined
}
