// Who the server signs as. Keys are generated here, never real ones.
import { createPublicKey, generateKeyPairSync } from "node:crypto"
import { Principal } from "@icp-sdk/core/principal"
import { describe, expect, it } from "vitest"
import {
  ANONYMOUS_CALLER,
  callerFrom,
  identityFromPem,
  type KeyFiles,
} from "../src/identity.ts"
import { UsageError } from "../src/usage.ts"

function generatePem(algorithm: "ed25519" | "secp256k1"): {
  readonly pem: string
  readonly principal: string
  readonly seed: Uint8Array
} {
  const { privateKey, publicKey } =
    algorithm === "ed25519"
      ? generateKeyPairSync("ed25519")
      : generateKeyPairSync("ec", { namedCurve: "secp256k1" })
  // The IC's self-authenticating principal is a hash of the DER public key.
  const der = new Uint8Array(publicKey.export({ format: "der", type: "spki" }))
  const jwk = privateKey.export({ format: "jwk" })
  return {
    pem: privateKey
      .export({
        format: "pem",
        type: algorithm === "ed25519" ? "pkcs8" : "sec1",
      })
      .toString(),
    principal: Principal.selfAuthenticating(der).toText(),
    seed: new Uint8Array(Buffer.from(jwk.d ?? "", "base64url")),
  }
}

const filesOf = (
  entries: Record<string, { readonly text: string; readonly mode?: number }>
): KeyFiles => ({
  mode: (path) => {
    const entry = entries[path]
    if (entry === undefined) throw new Error(`ENOENT: no such file ${path}`)
    return entry.mode
  },
  read: (path) => {
    const entry = entries[path]
    if (entry === undefined) throw new Error(`ENOENT: no such file ${path}`)
    return entry.text
  },
})

describe("callerFrom", () => {
  it("is anonymous without --identity", () => {
    expect(callerFrom(undefined, filesOf({}))).toBe(ANONYMOUS_CALLER)
    expect(ANONYMOUS_CALLER.identity).toBe("anonymous")
  })

  it.each(["ed25519", "secp256k1"] as const)(
    "signs as the %s key of a file only its owner can read",
    (algorithm) => {
      const key = generatePem(algorithm)
      const caller = callerFrom(
        "/keys/me.pem",
        filesOf({ "/keys/me.pem": { text: key.pem, mode: 0o100600 } })
      )
      expect(caller.algorithm).toBe(algorithm)
      expect(caller.source).toBe(`--identity /keys/me.pem (${algorithm})`)
      expect(
        caller.identity === "anonymous"
          ? undefined
          : caller.identity.getPrincipal().toText()
      ).toBe(key.principal)
    }
  )

  it("refuses a key file other users can read or write, before reading it", () => {
    const key = generatePem("ed25519")
    for (const mode of [0o100644, 0o100640, 0o100604, 0o100620, 0o100666]) {
      let read = false
      const files: KeyFiles = {
        mode: () => mode,
        read: () => {
          read = true
          return key.pem
        },
      }
      expect(() => callerFrom("/keys/me.pem", files)).toThrow(
        /other users of this machine .*chmod 600 \/keys\/me\.pem/
      )
      expect(read).toBe(false)
    }
  })

  it("does not check permission bits where there are none (Windows)", () => {
    const key = generatePem("ed25519")
    const caller = callerFrom(
      "C:\\keys\\me.pem",
      filesOf({ "C:\\keys\\me.pem": { text: key.pem } })
    )
    expect(caller.algorithm).toBe("ed25519")
  })

  it("says a missing file is missing", () => {
    expect(() => callerFrom("/keys/none.pem", filesOf({}))).toThrow(
      /--identity \/keys\/none\.pem: ENOENT/
    )
  })

  it("never quotes the key in a refusal", () => {
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" })
    const pem = privateKey.export({ format: "pem", type: "pkcs8" }).toString()
    const body = pem.split("\n")[1] ?? ""
    try {
      callerFrom("/k.pem", filesOf({ "/k.pem": { text: pem, mode: 0o600 } }))
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(UsageError)
      expect((error as Error).message).toMatch(/P-256/)
      expect((error as Error).message).not.toContain(body.slice(0, 20))
    }
  })
})

describe("identityFromPem", () => {
  it("reads a secp256k1 key in PKCS#8 form, and after an EC PARAMETERS block", () => {
    const { privateKey } = generateKeyPairSync("ec", {
      namedCurve: "secp256k1",
    })
    const pkcs8 = privateKey.export({ format: "pem", type: "pkcs8" }).toString()
    const sec1 = privateKey.export({ format: "pem", type: "sec1" }).toString()
    const withParameters = `-----BEGIN EC PARAMETERS-----\nBgUrgQQACg==\n-----END EC PARAMETERS-----\n${sec1}`
    const expected = identityFromPem(sec1, "sec1").identity.getPrincipal()
    for (const pem of [pkcs8, withParameters]) {
      expect(identityFromPem(pem, "pem").identity.getPrincipal().toText()).toBe(
        expected.toText()
      )
    }
  })

  it("reads dfx's Ed25519 form, which carries the public key too, and checks it", () => {
    const key = generatePem("ed25519")
    const publicKey = new Uint8Array(
      Buffer.from(
        createPublicKey(key.pem).export({ format: "jwk" }).x ?? "",
        "base64url"
      )
    )
    // SEQUENCE { version 1, Ed25519, OCTET STRING { OCTET STRING seed }, [1] public key }
    const der = Uint8Array.from([
      0x30,
      0x53,
      0x02,
      0x01,
      0x01,
      0x30,
      0x05,
      0x06,
      0x03,
      0x2b,
      0x65,
      0x70,
      0x04,
      0x22,
      0x04,
      0x20,
      ...key.seed,
      0xa1,
      0x23,
      0x03,
      0x21,
      0x00,
      ...publicKey,
    ])
    const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(der).toString("base64")}\n-----END PRIVATE KEY-----\n`
    expect(identityFromPem(pem, "pem").identity.getPrincipal().toText()).toBe(
      key.principal
    )

    const other = generatePem("ed25519").seed
    const mismatched = Uint8Array.from([
      ...der.slice(0, 16),
      ...other,
      ...der.slice(48),
    ])
    const lying = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(mismatched).toString("base64")}\n-----END PRIVATE KEY-----\n`
    expect(() => identityFromPem(lying, "pem")).toThrow(/public key/)
  })

  it("refuses an encrypted key, a P-256 key and text that is no key", () => {
    const { privateKey } = generateKeyPairSync("ed25519")
    const encrypted = privateKey
      .export({
        format: "pem",
        type: "pkcs8",
        cipher: "aes-256-cbc",
        passphrase: "test",
      })
      .toString()
    const p256 = generateKeyPairSync("ec", { namedCurve: "P-256" })
      .privateKey.export({ format: "pem", type: "pkcs8" })
      .toString()
    expect(() => identityFromPem(encrypted, "pem")).toThrow(/encrypted/)
    expect(() => identityFromPem(p256, "pem")).toThrow(/P-256/)
    expect(() => identityFromPem("hello", "pem")).toThrow(UsageError)
  })
})
