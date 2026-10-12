// @vitest-environment node
// The live interface loader over a fake CandidSource and the real compiler
// (its WASM runs in Node, offline): no test here touches the network.
import {
  CertificateVerificationErrorCode,
  HttpErrorCode,
  ProtocolError,
  RejectError,
  ReplicaRejectCode,
  TransportError,
  TrustError,
  UncertifiedRejectErrorCode,
  HttpFetchErrorCode,
  type RequestId,
} from "@icp-sdk/core/agent"
import { schemaFromContract } from "@candid-core/schema/contract"
import { describe, expect, it, vi } from "vitest"
import icrc1Did from "../../did/icrc1.did?raw"
import { compileInterface, MAX_DID_BYTES } from "./compile.ts"
import { serverCli } from "./compile.server.ts"
import {
  CANISTER_TTL_MS,
  createLiveInterfaceLoader,
  FAILURE_TTL_MS,
  TRANSIENT_FAILURE_TTL_MS,
} from "./live-loader.ts"
import type { CandidSource } from "./read-candid.ts"
import type { InterfacePayload } from "./types.ts"

const CKBTC_LEDGER = "mxzaz-hqaaa-aaaar-qaada-cai"
const CKETH_LEDGER = "ss2fx-dyaaa-aaaar-qacoq-cai"
const CAP_ROUTER = "lj532-6iaaa-aaaah-qcc7a-cai"
const LIFELINE = "rno2w-sqaaa-aaaaa-aaacq-cai"

const DOC_DID = `
service : {
  /// Says hello.
  /// Twice, if asked.
  greet : (name : text) -> (text) query;
  count : () -> (nat);
}
`

const HASH_A = new Uint8Array(32).fill(0xa1)
const HASH_B = new Uint8Array(32).fill(0xb2)

type Canister = {
  did?: string | null
  moduleHash?: Uint8Array | null
  tmpHack?: string
  metadataError?: unknown
  hashError?: unknown
  tmpHackError?: unknown
}

/** A fake mainnet: canisters by id, and a count of every read made. */
function fakeSource(canisters: Record<string, Canister>) {
  const reads = { candidAndHash: 0, moduleHash: 0, tmpHack: 0 }
  const canister = (id: string): Canister => {
    const found = canisters[id]
    if (found === undefined) throw new Error(`unexpected read of ${id}`)
    return found
  }
  const source: CandidSource = {
    async readCandidAndHash(id) {
      reads.candidAndHash++
      const c = canister(id)
      if (c.metadataError !== undefined) throw c.metadataError
      return {
        did: c.did ?? null,
        moduleHash: c.moduleHash === undefined ? HASH_A : c.moduleHash,
      }
    },
    async readModuleHash(id) {
      reads.moduleHash++
      const c = canister(id)
      if (c.hashError !== undefined) throw c.hashError
      return c.moduleHash === undefined ? HASH_A : c.moduleHash
    },
    async readTmpHack(id) {
      reads.tmpHack++
      const c = canister(id)
      if (c.tmpHack !== undefined) return c.tmpHack
      throw c.tmpHackError ?? noTmpHack()
    },
  }
  return { source, reads }
}

function setup(canisters: Record<string, Canister>) {
  const { source, reads } = fakeSource(canisters)
  let time = 1_000_000
  const compile = vi.fn((did: string) => compileInterface(serverCli, did))
  const loader = createLiveInterfaceLoader({
    source,
    compile,
    compiledIn: "server",
    now: () => time,
  })
  return {
    loader,
    reads,
    compile,
    advance: (ms: number) => {
      time += ms
    },
    canisters,
  }
}

function forbidden() {
  return ProtocolError.fromCode(
    new HttpErrorCode(
      403,
      "Forbidden",
      [],
      "Custom section candid:service can only be requested by the controllers of the canister."
    )
  )
}

function notFound() {
  return ProtocolError.fromCode(
    new HttpErrorCode(
      400,
      "Bad Request",
      [],
      "Requested canister rejected the message: canister_not_found"
    )
  )
}

function noTmpHack() {
  return RejectError.fromCode(
    new UncertifiedRejectErrorCode(
      new Uint8Array(32) as RequestId,
      ReplicaRejectCode.CanisterError,
      "Canister has no query method '__get_candid_interface_tmp_hack'",
      "IC0536",
      undefined
    )
  )
}

function badCertificate() {
  return TrustError.fromCode(
    new CertificateVerificationErrorCode("Signature verification failed")
  )
}

function ok(p: InterfacePayload): Extract<InterfacePayload, { ok: true }> {
  if (!p.ok) {
    throw new Error(`expected an interface, got ${p.code}: ${p.message}`)
  }
  return p
}

describe("canister ids", () => {
  it.each([
    ["not principal text", "not-a-principal", "invalid_canister_id"],
    [
      "upper case (never repaired)",
      "MXZAZ-HQAAA-AAAAR-QAADA-CAI",
      "invalid_canister_id",
    ],
    ["the management canister", "aaaaa-aa", "management_canister"],
    ["the anonymous principal", "2vxsx-fae", "not_a_canister"],
  ])("refuses %s without a read", async (_, id, code) => {
    const t = setup({})
    const p = await t.loader.load(id)
    expect(p).toMatchObject({ ok: false, canisterId: id, code })
    expect(t.reads).toEqual({ candidAndHash: 0, moduleHash: 0, tmpHack: 0 })
  })
})

describe("certified metadata", () => {
  it("compiles the candid:service of one read_state, with its docs", async () => {
    const t = setup({ [CKBTC_LEDGER]: { did: DOC_DID } })
    const p = ok(await t.loader.load(CKBTC_LEDGER))
    expect(p.source).toEqual({
      kind: "metadata",
      certified: true,
      moduleHash: "a1".repeat(32),
    })
    expect(p).toMatchObject({
      did: DOC_DID,
      cache: "miss",
      compiledIn: "server",
    })
    expect(p.didSha256).toMatch(/^[0-9a-f]{64}$/)
    expect(p.interfaceId).toMatch(/^candid-core:interface:v1:sha256:/)
    expect(p.docs).toEqual({ greet: "Says hello.\nTwice, if asked." })
    // The envelope is compact JSON the schema loader accepts.
    expect(p.envelopeJson).not.toContain("\n")
    const built = schemaFromContract(JSON.parse(p.envelopeJson ?? ""))
    expect(built.ok && built.actor !== undefined).toBe(true)
    expect(t.reads).toEqual({ candidAndHash: 1, moduleHash: 0, tmpHack: 0 })
  })

  it("answers from the cache within the TTL", async () => {
    const t = setup({ [CKBTC_LEDGER]: { did: icrc1Did } })
    const first = ok(await t.loader.load(CKBTC_LEDGER))
    t.advance(CANISTER_TTL_MS - 1)
    const second = ok(await t.loader.load(CKBTC_LEDGER))
    expect(second.cache).toBe("hit")
    expect(second.envelopeJson).toBe(first.envelopeJson)
    expect(t.reads).toEqual({ candidAndHash: 1, moduleHash: 0, tmpHack: 0 })
    expect(t.compile).toHaveBeenCalledTimes(1)
  })

  it("re-checks only the module hash after the TTL, and recompiles nothing while it is unchanged", async () => {
    const t = setup({ [CKBTC_LEDGER]: { did: icrc1Did } })
    const first = ok(await t.loader.load(CKBTC_LEDGER))
    t.advance(CANISTER_TTL_MS)
    const second = ok(await t.loader.load(CKBTC_LEDGER))
    expect(second.cache).toBe("hit")
    expect(second.fetchedAt).toBe(first.fetchedAt + CANISTER_TTL_MS)
    expect(t.reads).toEqual({ candidAndHash: 1, moduleHash: 1, tmpHack: 0 })
    expect(t.compile).toHaveBeenCalledTimes(1)
  })

  it("reads the interface again when the module hash changed (an upgrade)", async () => {
    const t = setup({ [CKBTC_LEDGER]: { did: icrc1Did } })
    await t.loader.load(CKBTC_LEDGER)
    t.canisters[CKBTC_LEDGER] = { did: DOC_DID, moduleHash: HASH_B }
    t.advance(CANISTER_TTL_MS)
    const upgraded = ok(await t.loader.load(CKBTC_LEDGER))
    expect(upgraded).toMatchObject({ did: DOC_DID, cache: "miss" })
    expect(upgraded.source).toMatchObject({ moduleHash: "b2".repeat(32) })
    expect(t.reads).toEqual({ candidAndHash: 2, moduleHash: 1, tmpHack: 0 })
    expect(t.compile).toHaveBeenCalledTimes(2)
  })

  it("compiles a .did once for every canister that publishes it", async () => {
    const t = setup({
      [CKBTC_LEDGER]: { did: icrc1Did, moduleHash: HASH_A },
      [CKETH_LEDGER]: { did: icrc1Did, moduleHash: HASH_B },
    })
    const ckbtc = ok(await t.loader.load(CKBTC_LEDGER))
    const cketh = ok(await t.loader.load(CKETH_LEDGER))
    expect(cketh.didSha256).toBe(ckbtc.didSha256)
    expect(cketh.envelopeJson).toBe(ckbtc.envelopeJson)
    expect(t.compile).toHaveBeenCalledTimes(1)
  })

  it("serves the last certified answer when the re-check fails on the network", async () => {
    const t = setup({ [CKBTC_LEDGER]: { did: icrc1Did } })
    const first = ok(await t.loader.load(CKBTC_LEDGER))
    t.canisters[CKBTC_LEDGER] = {
      did: icrc1Did,
      hashError: TransportError.fromCode(
        new HttpFetchErrorCode(new TypeError("fetch failed"))
      ),
    }
    t.advance(CANISTER_TTL_MS)
    const stale = ok(await t.loader.load(CKBTC_LEDGER))
    expect(stale).toMatchObject({ cache: "hit", fetchedAt: first.fetchedAt })
  })

  it("never answers from the cache when the re-check does not verify", async () => {
    const t = setup({ [CKBTC_LEDGER]: { did: icrc1Did } })
    await t.loader.load(CKBTC_LEDGER)
    t.canisters[CKBTC_LEDGER] = { did: icrc1Did, hashError: badCertificate() }
    t.advance(CANISTER_TTL_MS)
    expect(await t.loader.load(CKBTC_LEDGER)).toMatchObject({
      ok: false,
      code: "trust_error",
    })
  })

  it("loads a canister once for concurrent requests", async () => {
    const t = setup({ [CKBTC_LEDGER]: { did: icrc1Did } })
    const [a, b, c] = await Promise.all([
      t.loader.load(CKBTC_LEDGER),
      t.loader.load(CKBTC_LEDGER),
      t.loader.load(CKBTC_LEDGER),
    ])
    expect(a).toBe(b)
    expect(b).toBe(c)
    expect(t.reads.candidAndHash).toBe(1)
  })
})

describe("fallbacks and failures", () => {
  it("falls back to the tmp hack query and marks it uncertified", async () => {
    const t = setup({ [CAP_ROUTER]: { did: null, tmpHack: DOC_DID } })
    const p = ok(await t.loader.load(CAP_ROUTER))
    expect(p.source).toEqual({
      kind: "tmp_hack",
      certified: false,
      moduleHash: "a1".repeat(32),
      reason: "absent",
    })
    expect(t.reads).toEqual({ candidAndHash: 1, moduleHash: 0, tmpHack: 1 })
  })

  it("says no_interface when there is neither metadata nor a tmp hack", async () => {
    const t = setup({ [CAP_ROUTER]: { did: null } })
    expect(await t.loader.load(CAP_ROUTER)).toMatchObject({
      ok: false,
      code: "no_interface",
    })
  })

  it("reads the module hash alone after a 403, and says private_interface", async () => {
    const t = setup({ [LIFELINE]: { metadataError: forbidden() } })
    const p = await t.loader.load(LIFELINE)
    expect(p).toMatchObject({ ok: false, code: "private_interface" })
    expect(t.reads).toEqual({ candidAndHash: 1, moduleHash: 1, tmpHack: 1 })
  })

  it("uses a private canister's tmp hack, uncertified, when it has one", async () => {
    const t = setup({
      [LIFELINE]: {
        metadataError: forbidden(),
        moduleHash: HASH_B,
        tmpHack: DOC_DID,
      },
    })
    const p = ok(await t.loader.load(LIFELINE))
    expect(p.source).toEqual({
      kind: "tmp_hack",
      certified: false,
      moduleHash: "b2".repeat(32),
      reason: "private",
    })
    // The reason survives the cache.
    t.advance(CANISTER_TTL_MS)
    const again = ok(await t.loader.load(LIFELINE))
    expect(again.cache).toBe("hit")
    expect(again.source).toMatchObject({ reason: "private" })
  })

  it("never falls back after a certificate that does not verify", async () => {
    const t = setup({
      [CKBTC_LEDGER]: { metadataError: badCertificate(), tmpHack: DOC_DID },
    })
    const p = await t.loader.load(CKBTC_LEDGER)
    expect(p).toMatchObject({ ok: false, code: "trust_error" })
    expect(t.reads.tmpHack).toBe(0)
  })

  it("reports a tmp hack whose signature does not verify as trust_error", async () => {
    const t = setup({
      [CAP_ROUTER]: { did: null, tmpHackError: badCertificate() },
    })
    expect(await t.loader.load(CAP_ROUTER)).toMatchObject({
      ok: false,
      code: "trust_error",
    })
  })

  it("says canister_not_found for a 400 canister_not_found", async () => {
    const t = setup({ [CKBTC_LEDGER]: { metadataError: notFound() } })
    expect(await t.loader.load(CKBTC_LEDGER)).toMatchObject({
      ok: false,
      code: "canister_not_found",
    })
  })

  it("says no_interface for a canister with no module", async () => {
    const t = setup({ [CKBTC_LEDGER]: { did: null, moduleHash: null } })
    expect(await t.loader.load(CKBTC_LEDGER)).toMatchObject({
      ok: false,
      code: "no_interface",
    })
    expect(t.reads.tmpHack).toBe(0)
  })

  it("refuses a .did over the cap before compiling it", async () => {
    const huge = `service : {}\n// ${"x".repeat(MAX_DID_BYTES)}`
    const t = setup({ [CKBTC_LEDGER]: { did: huge } })
    expect(await t.loader.load(CKBTC_LEDGER)).toMatchObject({
      ok: false,
      code: "too_large",
    })
    expect(t.compile).not.toHaveBeenCalled()
  })

  it("returns the compiler's diagnostics for a .did that does not compile", async () => {
    const t = setup({ [CKBTC_LEDGER]: { did: "service : { broken" } })
    const p = await t.loader.load(CKBTC_LEDGER)
    expect(p).toMatchObject({ ok: false, code: "compile_failed" })
    if (p.ok) return
    expect(p.diagnostics?.length).toBeGreaterThan(0)
    expect(p.diagnostics?.[0]?.code).toBe("did_parse_error")
  })

  it("says no_interface for a .did without a service", async () => {
    const t = setup({ [CKBTC_LEDGER]: { did: "type T = nat;" } })
    expect(await t.loader.load(CKBTC_LEDGER)).toMatchObject({
      ok: false,
      code: "no_interface",
    })
  })

  it("remembers a definitive failure for five minutes", async () => {
    const t = setup({ [CAP_ROUTER]: { did: null } })
    await t.loader.load(CAP_ROUTER)
    t.advance(FAILURE_TTL_MS - 1)
    await t.loader.load(CAP_ROUTER)
    expect(t.reads.candidAndHash).toBe(1)
    t.advance(1)
    await t.loader.load(CAP_ROUTER)
    expect(t.reads.candidAndHash).toBe(2)
  })

  it("remembers a network failure only briefly", async () => {
    const network = TransportError.fromCode(
      new HttpFetchErrorCode(new TypeError("fetch failed"))
    )
    const t = setup({ [CKBTC_LEDGER]: { metadataError: network } })
    expect(await t.loader.load(CKBTC_LEDGER)).toMatchObject({
      ok: false,
      code: "network",
    })
    t.advance(TRANSIENT_FAILURE_TTL_MS - 1)
    await t.loader.load(CKBTC_LEDGER)
    expect(t.reads.candidAndHash).toBe(1)
    t.advance(1)
    t.canisters[CKBTC_LEDGER] = { did: icrc1Did }
    expect((await t.loader.load(CKBTC_LEDGER)).ok).toBe(true)
  })

  it("keeps a compiler failure's text (server paths) in the log: server_error", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {})
    const { source } = fakeSource({ [CKBTC_LEDGER]: { did: icrc1Did } })
    const loader = createLiveInterfaceLoader({
      source,
      compile: async () => {
        throw new Error(
          "ENOENT: no such file or directory, open '/srv/deploy/releases/2026-10-12/wasm/candid.wasm'"
        )
      },
      compiledIn: "server",
    })
    const p = await loader.load(CKBTC_LEDGER)
    expect(p).toMatchObject({ ok: false, code: "server_error" })
    expect(JSON.stringify(p)).not.toContain("/srv/")
    expect(logged).toHaveBeenCalledOnce()
    logged.mockRestore()
  })

  it("reports a compiler that could not load in a browser as a network failure", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {})
    const { source } = fakeSource({ [CKBTC_LEDGER]: { did: icrc1Did } })
    const loader = createLiveInterfaceLoader({
      source,
      compile: async () => {
        throw new TypeError("Failed to fetch dynamically imported module")
      },
      compiledIn: "browser",
    })
    expect(await loader.load(CKBTC_LEDGER)).toMatchObject({
      ok: false,
      code: "network",
      message: expect.stringMatching(/in this browser: Failed to fetch/),
    })
    logged.mockRestore()
  })

  it("bounds a load with its timeout", async () => {
    const hanging: CandidSource = {
      readCandidAndHash: () => new Promise(() => {}),
      readModuleHash: () => new Promise(() => {}),
      readTmpHack: () => new Promise(() => {}),
    }
    const loader = createLiveInterfaceLoader({
      source: hanging,
      compile: (did) => compileInterface(serverCli, did),
      compiledIn: "server",
      timeoutMs: 20,
    })
    expect(await loader.load(CKBTC_LEDGER)).toMatchObject({
      ok: false,
      code: "timeout",
    })
  })
})
