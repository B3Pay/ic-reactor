// Who the server calls as. Ported from examples/node-agent-tool.
//
// An MCP server runs under an agent and has no sign-in flow: it is handed a
// key, or it only reads.
//
// - `--identity <file>`: an Ed25519 or secp256k1 private key in PEM form, as
//   `icp identity export` or `dfx identity export` prints it. The file must be
//   readable by its owner only, as ssh asks of a key: anyone else who can read
//   it can sign as this principal.
// - else `identity: "anonymous"`. That client reads, and refuses every update
//   before sending it. It is never a `new AnonymousIdentity()`, which would
//   sign and send writes anonymously.
//
// A key is never generated here, and no message quotes a key's bytes.
import { createPrivateKey } from "node:crypto"
import type { Identity } from "@icp-sdk/core/agent"
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity"
import { Secp256k1KeyIdentity } from "@icp-sdk/core/identity/secp256k1"
import { UsageError } from "./usage.ts"

/** Who calls, and how they were chosen. */
export interface Caller {
  /** What `createClient({ identity })` is given. */
  readonly identity: Identity | "anonymous"
  /** The key's algorithm, or `null` for the anonymous caller. */
  readonly algorithm: "ed25519" | "secp256k1" | null
  /** Where the key came from, for a person to read. */
  readonly source: string
}

/** The anonymous caller: reads only. */
export const ANONYMOUS_CALLER: Caller = Object.freeze({
  identity: "anonymous",
  algorithm: null,
  source: "anonymous (no --identity): reads only",
})

/** What the identity file is read through: `node:fs`, or a fake in tests. */
export interface KeyFiles {
  /** The file's permission bits, or `undefined` where they mean nothing (Windows). */
  mode(path: string): number | undefined
  read(path: string): string
}

/**
 * The caller `--identity` names, or the anonymous one.
 *
 * @throws UsageError for a key file others can read, or one that cannot be read.
 */
export function callerFrom(path: string | undefined, files: KeyFiles): Caller {
  if (path === undefined) return ANONYMOUS_CALLER
  const what = `--identity ${path}`
  let pem: string
  try {
    const mode = files.mode(path)
    if (mode !== undefined && (mode & 0o077) !== 0) {
      throw new UsageError(
        `${what} can be read or changed by other users of this machine (mode ${(mode & 0o777).toString(8).padStart(3, "0")}): ` +
          `run chmod 600 ${path}, so that only you can sign with it`
      )
    }
    pem = files.read(path)
  } catch (error) {
    if (error instanceof UsageError) throw error
    throw new UsageError(
      `${what}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
  const { identity, algorithm } = identityFromPem(pem, what)
  return { identity, algorithm, source: `${what} (${algorithm})` }
}

/**
 * The private key of a PEM file as an Identity.
 *
 * - Ed25519 comes as PKCS#8 (`BEGIN PRIVATE KEY`). dfx writes the form that
 *   also carries the public key, which OpenSSL (and so `node:crypto`) refuses,
 *   so the 32-byte seed is read from the DER here, and a public key next to it
 *   must match.
 * - secp256k1 comes as SEC1 (`BEGIN EC PRIVATE KEY`, possibly after an
 *   `EC PARAMETERS` block) or PKCS#8; `node:crypto` reads both.
 *
 * @throws UsageError for anything else, an encrypted key included.
 */
export function identityFromPem(
  pem: string,
  what: string
): { identity: Identity; algorithm: "ed25519" | "secp256k1" } {
  const labels = [...pem.matchAll(/-----BEGIN ([A-Z0-9 ]+)-----/g)].map(
    (match) => match[1]
  )
  if (labels.includes("ENCRYPTED PRIVATE KEY")) {
    throw new UsageError(
      `${what} is encrypted: export the key unencrypted (icp identity export <name>)`
    )
  }
  const der = derOf(pem, "PRIVATE KEY")
  const seed = der === undefined ? undefined : ed25519SeedOf(der)
  if (der !== undefined && seed !== undefined) {
    const identity = Ed25519KeyIdentity.fromSecretKey(seed)
    const stated = ed25519PublicKeyOf(der)
    const actual = new Uint8Array(identity.getPublicKey().toRaw())
    if (stated !== undefined && !sameBytes(stated, actual)) {
      throw new UsageError(
        `${what}: the public key in the file is not the private key's`
      )
    }
    return { identity, algorithm: "ed25519" }
  }

  let jwk: { kty?: string; crv?: string; d?: string }
  try {
    jwk = createPrivateKey(pem).export({ format: "jwk" })
  } catch {
    throw new UsageError(
      `${what} holds no private key this server can read: it reads Ed25519 and secp256k1 keys in PEM form`
    )
  }
  if (jwk.kty !== "EC" || jwk.crv !== "secp256k1" || jwk.d === undefined) {
    throw new UsageError(
      `${what} holds a ${jwk.crv ?? jwk.kty ?? "different"} key: this server signs with Ed25519 or secp256k1 keys`
    )
  }
  const secret = new Uint8Array(Buffer.from(jwk.d, "base64url"))
  return {
    identity: Secp256k1KeyIdentity.fromSecretKey(secret),
    algorithm: "secp256k1",
  }
}

/** The DER bytes of the first `label` block of a PEM text. */
function derOf(pem: string, label: string): Uint8Array | undefined {
  const match = new RegExp(
    `-----BEGIN ${label}-----([A-Za-z0-9+/=\\s]+)-----END ${label}-----`
  ).exec(pem)
  return match?.[1] === undefined
    ? undefined
    : new Uint8Array(Buffer.from(match[1].replace(/\s+/g, ""), "base64"))
}

/**
 * PKCS#8 for Ed25519 (RFC 8410): SEQUENCE { version 0 or 1, the algorithm
 * 1.3.101.112, OCTET STRING { OCTET STRING (32-byte seed) } [, public key] }.
 */
const ED25519_ALGORITHM_AND_SEED = [
  0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
]

function ed25519SeedOf(der: Uint8Array): Uint8Array | undefined {
  const version = der[4]
  const prefixed =
    der[0] === 0x30 &&
    der[1] === der.length - 2 &&
    der[2] === 0x02 &&
    der[3] === 0x01 &&
    (version === 0 || version === 1) &&
    ED25519_ALGORITHM_AND_SEED.every((byte, i) => der[5 + i] === byte)
  if (!prefixed) return undefined
  const start = 5 + ED25519_ALGORITHM_AND_SEED.length
  const seed = der.slice(start, start + 32)
  return seed.length === 32 ? seed : undefined
}

/** The public key a version 1 key carries after its seed, in either tagging dfx and OpenSSL use. */
function ed25519PublicKeyOf(der: Uint8Array): Uint8Array | undefined {
  const rest = der.slice(5 + ED25519_ALGORITHM_AND_SEED.length + 32)
  const explicit = [0xa1, 0x23, 0x03, 0x21, 0x00]
  const implicit = [0x81, 0x21, 0x00]
  for (const tag of [explicit, implicit]) {
    if (
      rest.length === tag.length + 32 &&
      tag.every((byte, i) => rest[i] === byte)
    ) {
      return rest.slice(tag.length)
    }
  }
  return undefined
}

const sameBytes = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && a.every((byte, i) => byte === b[i])
