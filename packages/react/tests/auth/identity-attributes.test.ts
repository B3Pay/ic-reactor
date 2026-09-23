import { describe, it, expect } from "vitest"
import { IDL } from "@icp-sdk/core/candid"
import {
  decodeIdentityAttributeValues,
  identityAttributeKeys,
} from "../../src/auth/identity-attributes.js"

describe("Internet Identity attributes", () => {
  it("builds scoped identity attribute keys for OpenID providers", () => {
    expect(
      identityAttributeKeys({
        openIdProvider: "https://issuer.example.com",
        keys: ["sub", "email"],
      })
    ).toEqual([
      "openid:https://issuer.example.com:sub",
      "openid:https://issuer.example.com:email",
    ])

    expect(
      identityAttributeKeys({
        openIdProvider: "microsoft",
        keys: ["email"],
      })
    ).toEqual(["openid:https://login.microsoftonline.com/{tid}/v2.0:email"])
  })

  it("decodes current beta DIDL tuple payloads for display values", () => {
    const requestedKeys = identityAttributeKeys({
      openIdProvider: "https://issuer.example.com",
      keys: ["email", "name"],
    })
    const data = IDL.encode(
      [IDL.Vec(IDL.Tuple(IDL.Text, IDL.Text))],
      [
        [
          [requestedKeys[0], "alice@example.com"],
          [requestedKeys[1], "Alice Example"],
        ],
      ]
    )

    expect(decodeIdentityAttributeValues(data, requestedKeys)).toEqual({
      email: "alice@example.com",
      name: "Alice Example",
    })
  })

  it("only extracts printable values following requested scoped keys", () => {
    const requestedKeys = identityAttributeKeys({
      openIdProvider: "https://issuer.example.com",
      keys: ["email"],
    })
    const textPayload = new TextEncoder().encode(
      `noise openid:https://issuer.example.com:name\u0005Mallory ${requestedKeys[0]}\u0011alice@example.com`
    )

    expect(decodeIdentityAttributeValues(textPayload, requestedKeys)).toEqual({
      email: "alice@example.com",
    })
  })

  it("stops fallback text extraction before the next scoped key", () => {
    const requestedKeys = identityAttributeKeys({
      openIdProvider: "microsoft",
      keys: ["email", "name"],
    })
    const textPayload = new TextEncoder().encode(
      `${requestedKeys[0]}\u0010b3hr4d@live.com8${requestedKeys[1]}\u000ebehrad deylami`
    )

    expect(decodeIdentityAttributeValues(textPayload, requestedKeys)).toEqual({
      email: "b3hr4d@live.com",
      name: "behrad deylami",
    })
  })

  it("trims repeated numeric length prefixes before the next scoped key", () => {
    const requestedKeys = identityAttributeKeys({
      openIdProvider: "https://issuer.example.com",
      keys: ["email", "name"],
    })
    const textPayload = new TextEncoder().encode(
      `${requestedKeys[0]}\u0011alice@example.com${"0".repeat(128)}${requestedKeys[1]}\u0005Alice`
    )

    expect(decodeIdentityAttributeValues(textPayload, requestedKeys)).toEqual({
      email: "alice@example.com",
      name: "Alice",
    })
  })
})

/**
 * What Internet Identity actually returns for `ii-icrc3-attributes`: a
 * Candid-encoded ICRC-3 `Value::Map` holding the certified attributes next to
 * the `implicit:` nonce, origin and issue time (`icrc3_attribute_message` in
 * the II canister). None of the shapes tried above decode it, so every real
 * response went to the printable-text fallback.
 */
describe("Internet Identity's ICRC-3 attribute message", () => {
  // The ICRC-3 `Value` II encodes with (`types/icrc3.rs` in the II repo).
  const Icrc3Value = IDL.Rec()
  Icrc3Value.fill(
    IDL.Variant({
      Nat: IDL.Nat,
      Int: IDL.Int,
      Blob: IDL.Vec(IDL.Nat8),
      Text: IDL.Text,
      Array: IDL.Vec(Icrc3Value),
      Map: IDL.Vec(IDL.Tuple(IDL.Text, Icrc3Value)),
    })
  )

  /** Encodes a message as the canister does, with its keys in BTreeMap order. */
  function iiMessage(
    attributes: Record<string, string>,
    origin = "https://some-dapp.com"
  ) {
    const entries: Record<string, unknown> = {
      "implicit:issued_at_timestamp_ns": { Nat: 1_800_000_035_000_000_000n },
      "implicit:nonce": { Blob: new Uint8Array(32) },
      "implicit:origin": { Text: origin },
    }
    for (const [key, value] of Object.entries(attributes)) {
      entries[key] = { Text: value }
    }
    const map = Object.keys(entries)
      .sort()
      .map((key) => [key, entries[key]])
    return new Uint8Array(IDL.encode([Icrc3Value], [{ Map: map }]))
  }

  const fromHex = (hex: string) =>
    Uint8Array.from(hex.match(/../g) ?? [], (byte) => parseInt(byte, 16))

  it("decodes the canister's own message for a one-click Google email and name", () => {
    // `message_hex` of the "Email and name with scoped keys" vector in
    // dfinity/internet-identity `docs/icrc3-test-vectors.json` (c153a486b):
    // the bytes the canister certifies for the keys
    // `requestOpenId({ openIdProvider: "google", keys: ["email", "name"] })`
    // asks for. The fallback read the email as
    // `alice.example@icrc3-test.invalid'`, because the name key's length
    // prefix, 39, is an apostrophe.
    const message = fromHex(
      "4449444c056b06cf89df017cfc84eb0101c189ee017dfdd2c9df0203cdf1cbbe0371f9baf3c50b046d026c02007101006d7b6d00010001051f696d706c696369743a6973737565645f61745f74696d657374616d705f6e730280bcf6ceebcfb8fd180e696d706c696369743a6e6f6e6365032000000000000000000000000000000000000000000000000000000000000000000f696d706c696369743a6f726967696e041568747470733a2f2f736f6d652d646170702e636f6d286f70656e69643a68747470733a2f2f6163636f756e74732e676f6f676c652e636f6d3a656d61696c0420616c6963652e6578616d706c654069637263332d746573742e696e76616c6964276f70656e69643a68747470733a2f2f6163636f756e74732e676f6f676c652e636f6d3a6e616d65040d416c696365204578616d706c65"
    )
    const keys = identityAttributeKeys({
      openIdProvider: "google",
      keys: ["email", "name"],
    })

    expect(decodeIdentityAttributeValues(message, keys)).toEqual({
      email: "alice.example@icrc3-test.invalid",
      name: "Alice Example",
    })
  })

  it.each([
    // 36 characters, so the length prefix is `$`, which the fallback kept.
    ["christopher.alexander.long@gmail.com", "Chris Long"],
    // The fallback stopped at the first non-ASCII character: "Jos".
    ["jose@example.com", "José Álvarez"],
    // No ASCII run at all, so the fallback took the next one it found, the
    // verified email address, and returned it as the name.
    ["mohammad@example.com", "محمد رضایی"],
  ])("returns %s / %s exactly as certified", (email, name) => {
    const keys = identityAttributeKeys({
      openIdProvider: "google",
      keys: ["email", "name", "verified_email"],
    })
    const message = iiMessage({
      [keys[0]]: email,
      [keys[1]]: name,
      [keys[2]]: email,
    })

    expect(decodeIdentityAttributeValues(message, keys)).toEqual({
      email,
      name,
      verified_email: email,
    })
  })

  it("finds a key as a map key, not inside another entry's value", () => {
    // Unscoped keys are certified bare, and `implicit:origin` sorts before
    // `name`, so a text search found "name" inside the origin and returned
    // ".app".
    const message = iiMessage(
      { email: "ada@example.com", name: "Ada" },
      "https://username.app"
    )

    expect(decodeIdentityAttributeValues(message, ["email", "name"])).toEqual({
      email: "ada@example.com",
      name: "Ada",
    })
  })
})
