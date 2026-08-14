import { describe, it, expect } from "vitest"
import { IDL } from "@icp-sdk/core/candid"
import { didToDisplayCodec } from "../src/display/index.js"
import { hexToUint8Array } from "../src/utils/index.js"
import type { BlobType, DisplayResultOf } from "../src/display/types.js"
import type { TransformReturnRegistry } from "../src/types/index.js"

// Type-level pins for the direction-aware blob mapping: results are exactly
// `string`, args keep the wider union the encode path genuinely accepts.
// These lines compile only while that stays true (the typecheck CI gate runs
// tsc over tests). No `as` assertions: `true as never` is legal (never is
// assignable to true), so an asserted pin still compiles when a helper
// collapses to never. IsExact yields a plain true/false, and assigning the
// bare literal `true` to it fails tsc the moment either direction regresses.
type IsExact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type BlobResult = TransformReturnRegistry<Uint8Array>["display"]
const _resultIsString: IsExact<BlobResult, string> = true
const _nestedIsString: IsExact<
  DisplayResultOf<{ certificate: Uint8Array }>,
  { certificate: string }
> = true
const _argsKeepBytes: Uint8Array extends BlobType ? true : false = true
const _argsKeepByteArray: number[] extends BlobType ? true : false = true
void [_resultIsString, _nestedIsString, _argsKeepBytes, _argsKeepByteArray]

// Regression for the 512-byte representation switch (#245): the display
// transform rendered a blob as a hex string at or below 512 bytes and as a
// Uint8Array above it, so one Candid type produced two JS types depending on
// payload size — observed live in a single ckTESTBTC `get_data_certificate`
// record (80-byte `hash_tree` → string, 2028-byte `certificate` →
// Uint8Array). Every blob now decodes to a hex string.

const blobCodec = () => didToDisplayCodec<Uint8Array>(IDL.Vec(IDL.Nat8))

describe("blob display representation is size-independent", () => {
  it.each([0, 1, 511, 512, 513, 600, 2028])(
    "a %i-byte blob decodes to a hex string",
    (size) => {
      const bytes = new Uint8Array(size).fill(0xab)
      const display = blobCodec().asDisplay(bytes)

      expect(typeof display).toBe("string")
      expect(display).toBe("ab".repeat(size))
    }
  )

  it("one record, one Candid type, one JS type — the live ckTESTBTC shape", () => {
    // record { certificate : opt blob; hash_tree : blob } — the exact shape
    // that surfaced the defect, with the live payload sizes.
    const DataCertificate = IDL.Record({
      certificate: IDL.Opt(IDL.Vec(IDL.Nat8)),
      hash_tree: IDL.Vec(IDL.Nat8),
    })
    const codec = didToDisplayCodec(DataCertificate)

    const display = codec.asDisplay({
      certificate: [new Uint8Array(2028).fill(0x11)],
      hash_tree: new Uint8Array(80).fill(0x22),
    }) as { certificate: unknown; hash_tree: unknown }

    expect(typeof display.hash_tree).toBe("string")
    expect(typeof display.certificate).toBe("string")
    expect(display.certificate).toBe("11".repeat(2028))
    expect(display.hash_tree).toBe("22".repeat(80))
  })

  it("large blobs survive a JSON round-trip back to the original bytes", () => {
    // The consumer-facing corruption: JSON.stringify(Uint8Array) is an
    // index-keyed object, so any layer that serialises display values (SSR
    // payloads, localStorage, form state) round-tripped small blobs but
    // corrupted large ones.
    const codec = blobCodec()
    const original = Uint8Array.from({ length: 2028 }, (_, i) => i % 256)

    const display = codec.asDisplay(original)
    const revived: unknown = JSON.parse(JSON.stringify({ blob: display })).blob

    expect(typeof revived).toBe("string")
    const encoded = codec.asCandid(revived as string) as Uint8Array
    expect(encoded).toBeInstanceOf(Uint8Array)
    expect(encoded).toEqual(original)
  })

  it("encode still accepts every documented input form for large payloads", () => {
    const codec = blobCodec()
    const bytes = new Uint8Array(600).fill(0x2a)

    // Hex string (what decode now always produces), raw bytes, and a plain
    // byte array all encode to the same Uint8Array.
    expect(codec.asCandid("2a".repeat(600))).toEqual(bytes)
    expect(codec.asCandid(bytes)).toEqual(bytes)
    expect(codec.asCandid(Array.from(bytes))).toEqual(bytes)
  })

  it("decode/encode round-trips are lossless at the old boundary", () => {
    const codec = blobCodec()

    for (const size of [511, 512, 513]) {
      const bytes = Uint8Array.from({ length: size }, (_, i) => (i * 7) % 256)
      const display = codec.asDisplay(bytes)
      expect(codec.asCandid(display)).toEqual(bytes)
      // And the display form is exactly what hexToUint8Array understands.
      expect(hexToUint8Array(display as string)).toEqual(bytes)
    }
  })
})
