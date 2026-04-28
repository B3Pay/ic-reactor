import { describe, it, expect } from "vitest"
import { IDL } from "@icp-sdk/core/candid"
import {
  decodeIdentityAttributeValues,
  identityAttributeKeys,
} from "../src/identity-attributes"

describe("identity attributes", () => {
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
})
