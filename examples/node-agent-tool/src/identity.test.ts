// Scenario 1: identity. Keys are generated here, never real ones.
import { createPublicKey, generateKeyPairSync } from "node:crypto"
import { describe, expect, it } from "vitest"
import { identityFromPem, SEED_VARIABLE } from "./identity.ts"
import { UsageError } from "./input.ts"
import { createCli, generatePem } from "./test-kit.ts"

const ANONYMOUS = "2vxsx-fae"

describe("loading a key", () => {
  it.each(["ed25519", "secp256k1"] as const)(
    "reads a %s PEM into an identity with the key's principal",
    (algorithm) => {
      const key = generatePem(algorithm)
      const loaded = identityFromPem(key.pem, "--pem key.pem")
      expect(loaded.algorithm).toBe(algorithm)
      expect(loaded.identity.getPrincipal().toText()).toBe(key.principal)
    }
  )

  it("reads a secp256k1 key in PKCS#8 form, and after an EC PARAMETERS block", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ec", {
      namedCurve: "secp256k1",
    })
    const pkcs8 = privateKey.export({ format: "pem", type: "pkcs8" }).toString()
    const sec1 = privateKey.export({ format: "pem", type: "sec1" }).toString()
    const withParameters = `-----BEGIN EC PARAMETERS-----\nBgUrgQQACg==\n-----END EC PARAMETERS-----\n${sec1}`
    const expected = identityFromPem(sec1, "sec1").identity.getPrincipal()
    expect(publicKey.asymmetricKeyType).toBe("ec")
    for (const pem of [pkcs8, withParameters]) {
      expect(identityFromPem(pem, "pem").identity.getPrincipal().toText()).toBe(
        expected.toText()
      )
    }
  })

  it("reads dfx's Ed25519 form, which carries the public key too", () => {
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

describe("whoami", () => {
  it("is anonymous without a key, and says writes are refused", async () => {
    const { cli } = createCli()
    const human = await cli(["whoami"])
    expect(human.exitCode).toBe(0)
    expect(human.options?.identity).toBe("anonymous")
    expect(human.stdout.join("\n")).toMatch(/principal\s+2vxsx-fae/)
    expect(human.stdout.join("\n")).toMatch(/refused by the client/)

    const json = await cli(["whoami", "--json"])
    expect(json.docs).toEqual([
      {
        ok: true,
        command: "whoami",
        principal: ANONYMOUS,
        status: "anonymous",
        canWrite: false,
        identity: {
          algorithm: null,
          source: expect.stringContaining("anonymous"),
        },
        network: "ic",
      },
    ])
    expect(json.requests).toEqual([])
  })

  it.each(["ed25519", "secp256k1"] as const)(
    "signs as the %s key of --pem",
    async (algorithm) => {
      const key = generatePem(algorithm)
      const { cli } = createCli({ files: { "me.pem": key.pem } })
      const result = await cli(["whoami", "--pem", "me.pem", "--json"])
      expect(result.exitCode).toBe(0)
      expect(result.docs[0]).toMatchObject({
        principal: key.principal,
        status: "signed-in",
        canWrite: true,
        identity: { algorithm, source: `--pem me.pem (${algorithm})` },
      })
    }
  )

  it(`signs as the Ed25519 seed in ${SEED_VARIABLE}`, async () => {
    const key = generatePem("ed25519")
    const { cli } = createCli()
    const result = await cli(["whoami", "--json"], {
      env: { [SEED_VARIABLE]: Buffer.from(key.seed).toString("hex") },
    })
    expect(result.docs[0]).toMatchObject({
      principal: key.principal,
      status: "signed-in",
    })
  })

  it("refuses two keys at once, a missing file and a bad seed, building no client", async () => {
    const key = generatePem("ed25519")
    const { cli } = createCli({ files: { "me.pem": key.pem } })
    const seed = { [SEED_VARIABLE]: Buffer.from(key.seed).toString("hex") }
    for (const [argv, env, reason] of [
      [["whoami", "--pem", "me.pem"], seed, /both --pem and/],
      [["whoami", "--pem", "missing.pem"], {}, /ENOENT/],
      [["whoami"], { [SEED_VARIABLE]: "abc" }, /not hex/],
    ] as const) {
      const result = await cli(argv, { env })
      expect(result.exitCode).toBe(2)
      expect(result.stderr.join("\n")).toMatch(reason)
      expect(result.options).toBeUndefined()
    }
  })
})

describe("a key signs what the replica checks", () => {
  it.each(["ed25519", "secp256k1"] as const)(
    "a transfer is sent as the %s key's principal",
    async (algorithm) => {
      const key = generatePem(algorithm)
      const { cli, ledger } = createCli({
        files: { "me.pem": key.pem },
        ledger: { balances: [[key.principal, 500_000_000n]] },
      })
      const result = await cli(["transfer", ANONYMOUS, "1", "--pem", "me.pem"])
      expect(result.exitCode).toBe(0)
      const call = result.requests.find((r) => r.endpoint === "call")
      expect(call?.caller).toBe(key.principal)
      expect(call?.refused).toBeUndefined()
      expect(ledger.received.map((r) => r.caller)).toEqual([key.principal])
    }
  )

  it("an anonymous client refuses the write before sending it (exit 4)", async () => {
    const { cli, ledger } = createCli()
    const human = await cli(["transfer", ANONYMOUS, "1"])
    expect(human.exitCode).toBe(4)
    expect(human.stderr.join("\n")).toMatch(/error: unauthenticated/)
    expect(human.stderr.join("\n")).toMatch(/Pass --pem <file>/)
    expect(human.requests.some((r) => r.endpoint === "call")).toBe(false)
    expect(ledger.received).toEqual([])

    const json = await cli(["transfer", ANONYMOUS, "1", "--json"])
    expect(json.docs[0]).toMatchObject({
      ok: false,
      command: "transfer",
      kind: "unauthenticated",
      mayHaveExecuted: false,
    })
  })
})
