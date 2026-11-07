// The interface loader over a fake CandidSource and the real compiler (its
// WASM runs in a worker, offline): no test here touches the network.
import { createHash } from "node:crypto"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  CertificateVerificationErrorCode,
  HttpErrorCode,
  HttpFetchErrorCode,
  ProtocolError,
  RejectError,
  ReplicaRejectCode,
  TransportError,
  TrustError,
  UncertifiedRejectErrorCode,
  type RequestId,
} from "@icp-sdk/core/agent"
import { readFile } from "node:fs/promises"
import { serviceMethods } from "@meantjs/schema"
import { afterAll, describe, expect, it, vi } from "vitest"
import { MAX_DID_BYTES, type CandidCli } from "./compile.ts"
import { createWorkerCli } from "./compile-worker.ts"
import {
  createInterfaceLoader,
  FAILURE_TTL_MS,
  RECHECK_MS,
  TRANSIENT_FAILURE_TTL_MS,
  type LoaderOptions,
} from "./loader.ts"
import type { CandidSource } from "./read-candid.ts"
import type { CanisterInterface, LoadResult } from "./types.ts"

const icrc1Did = await readFile(
  new URL("./fixtures/icrc1.did", import.meta.url),
  "utf8"
)

const CKBTC_LEDGER = "mxzaz-hqaaa-aaaar-qaada-cai"
const CKETH_LEDGER = "ss2fx-dyaaa-aaaar-qacoq-cai"
const CAP_ROUTER = "lj532-6iaaa-aaaah-qcc7a-cai"
const LIFELINE = "rno2w-sqaaa-aaaaa-aaacq-cai"
const LOCAL_CANISTER = "bkyz2-fmaaa-aaaaa-qaaaq-cai"

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

/** A fake IC: canisters by id, and a count of every read made. */
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

// One worker for the file; each loader counts what reaches it.
const worker = createWorkerCli()
afterAll(() => worker.close())

function countingCli(overrides: Partial<CandidCli> = {}) {
  const calls = { contract: 0, projection: 0 }
  const cli: CandidCli = {
    didToContract: (sources) => {
      calls.contract++
      return worker.didToContract(sources)
    },
    didToModule: (sources) => worker.didToModule(sources),
    projectDid: (sources, methods) => {
      calls.projection++
      return worker.projectDid(sources, methods)
    },
    checkCompatible: (written, live) => worker.checkCompatible(written, live),
    ...overrides,
  }
  return { cli, calls }
}

function setup(
  canisters: Record<string, Canister>,
  options: Partial<LoaderOptions> = {}
) {
  const { source, reads } = fakeSource(canisters)
  const { cli, calls } = countingCli()
  let time = 1_000_000
  const loader = createInterfaceLoader({
    source,
    cli,
    now: () => time,
    ...options,
  })
  return {
    loader,
    reads,
    calls,
    canisters,
    now: () => time,
    advance: (ms: number) => {
      time += ms
    },
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

function networkDown() {
  return TransportError.fromCode(
    new HttpFetchErrorCode(new TypeError("fetch failed"))
  )
}

function ok(result: LoadResult): CanisterInterface {
  if (!result.ok) {
    throw new Error(
      `expected an interface, got ${result.code}: ${result.message}`
    )
  }
  return result.iface
}

const sha256 = (text: string) =>
  createHash("sha256").update(text, "utf8").digest("hex")

describe("canister ids", () => {
  it.each([
    ["not principal text", "not-a-principal", "invalid_canister_id"],
    [
      "upper case (never repaired)",
      "MXZAZ-HQAAA-AAAAR-QAADA-CAI",
      "invalid_canister_id",
    ],
    ["the anonymous principal", "2vxsx-fae", "invalid_canister_id"],
    ["the management canister", "aaaaa-aa", "management_canister"],
  ])("refuses %s without a read", async (_, id, code) => {
    const t = setup({})
    expect(await t.loader.load(id)).toMatchObject({
      ok: false,
      canisterId: id,
      code,
    })
    expect(t.reads).toEqual({ candidAndHash: 0, moduleHash: 0, tmpHack: 0 })
  })

  it("refuses the management canister even with a .did file named for it", async () => {
    const readFile = vi.fn(async () => DOC_DID)
    const t = setup({}, { files: new Map([["aaaaa-aa", "ic.did"]]), readFile })
    expect(await t.loader.load("aaaaa-aa")).toMatchObject({
      code: "management_canister",
    })
    expect(readFile).not.toHaveBeenCalled()
  })
})

describe("certified metadata", () => {
  it("compiles the candid:service of one read_state, with its docs", async () => {
    const t = setup({ [CKBTC_LEDGER]: { did: DOC_DID } })
    const iface = ok(await t.loader.load(CKBTC_LEDGER))
    expect(iface).toMatchObject({
      canisterId: CKBTC_LEDGER,
      provenance: {
        kind: "metadata",
        certified: true,
        moduleHash: "a1".repeat(32),
      },
      did: DOC_DID,
      didSha256: sha256(DOC_DID),
      loadedAt: t.now(),
      omitted: [],
    })
    expect(iface.interfaceId).toMatch(/^candid-core:interface:v1:sha256:/)
    expect(serviceMethods(iface.actor).size).toBe(2)
    expect([...iface.methods.keys()]).toEqual(["count", "greet"])
    expect(iface.methods.get("greet")).toMatchObject({
      name: "greet",
      mode: "query",
      doc: "Says hello.\nTwice, if asked.",
    })
    expect(iface.methods.get("count")?.doc).toBeUndefined()
    expect(t.reads).toEqual({ candidAndHash: 1, moduleHash: 0, tmpHack: 0 })
  })

  it("answers from the cache until the re-check is due", async () => {
    const t = setup({ [CKBTC_LEDGER]: { did: icrc1Did } })
    const first = ok(await t.loader.load(CKBTC_LEDGER))
    t.advance(RECHECK_MS - 1)
    const second = ok(await t.loader.load(CKBTC_LEDGER))
    expect(second.actor).toBe(first.actor)
    expect(second.loadedAt).toBe(first.loadedAt)
    expect(t.reads).toEqual({ candidAndHash: 1, moduleHash: 0, tmpHack: 0 })
    expect(t.calls.contract).toBe(1)
  })

  it("re-checks only the module hash once due, and recompiles nothing while it is unchanged", async () => {
    const t = setup({ [CKBTC_LEDGER]: { did: icrc1Did } })
    const first = ok(await t.loader.load(CKBTC_LEDGER))
    t.advance(RECHECK_MS)
    const second = ok(await t.loader.load(CKBTC_LEDGER))
    expect(second.loadedAt).toBe(first.loadedAt + RECHECK_MS)
    expect(second.methods).toBe(first.methods)
    expect(t.reads).toEqual({ candidAndHash: 1, moduleHash: 1, tmpHack: 0 })
    expect(t.calls.contract).toBe(1)
  })

  it("re-checks the module hash on every load when recheckMs is 0", async () => {
    const t = setup({ [LOCAL_CANISTER]: { did: icrc1Did } }, { recheckMs: 0 })
    await t.loader.load(LOCAL_CANISTER)
    await t.loader.load(LOCAL_CANISTER)
    await t.loader.load(LOCAL_CANISTER)
    expect(t.reads).toEqual({ candidAndHash: 1, moduleHash: 2, tmpHack: 0 })
  })

  it("reads the interface again when the module hash changed (an upgrade)", async () => {
    const t = setup({ [CKBTC_LEDGER]: { did: icrc1Did } })
    await t.loader.load(CKBTC_LEDGER)
    t.canisters[CKBTC_LEDGER] = { did: DOC_DID, moduleHash: HASH_B }
    t.advance(RECHECK_MS)
    const upgraded = ok(await t.loader.load(CKBTC_LEDGER))
    expect(upgraded.did).toBe(DOC_DID)
    expect(upgraded.provenance).toMatchObject({ moduleHash: "b2".repeat(32) })
    expect(t.reads).toEqual({ candidAndHash: 2, moduleHash: 1, tmpHack: 0 })
    expect(t.calls.contract).toBe(2)
  })

  it("compiles a .did once for every canister that publishes it, loaded together or not", async () => {
    const t = setup({
      [CKBTC_LEDGER]: { did: icrc1Did, moduleHash: HASH_A },
      [CKETH_LEDGER]: { did: icrc1Did, moduleHash: HASH_B },
      [LOCAL_CANISTER]: { did: icrc1Did },
    })
    const [ckbtc, cketh] = await Promise.all([
      t.loader.load(CKBTC_LEDGER).then(ok),
      t.loader.load(CKETH_LEDGER).then(ok),
    ])
    const local = ok(await t.loader.load(LOCAL_CANISTER))
    expect(cketh.didSha256).toBe(ckbtc.didSha256)
    expect(cketh.actor).toBe(ckbtc.actor)
    expect(local.methods).toBe(ckbtc.methods)
    expect(cketh.canisterId).toBe(CKETH_LEDGER)
    expect(t.calls.contract).toBe(1)
  })

  it("serves the last certified answer when the re-check fails on the network", async () => {
    const t = setup({ [CKBTC_LEDGER]: { did: icrc1Did } })
    const first = ok(await t.loader.load(CKBTC_LEDGER))
    t.canisters[CKBTC_LEDGER] = { did: icrc1Did, hashError: networkDown() }
    t.advance(RECHECK_MS)
    const stale = ok(await t.loader.load(CKBTC_LEDGER))
    expect(stale.loadedAt).toBe(first.loadedAt)
  })

  it("never answers from the cache when the re-check does not verify", async () => {
    const t = setup({ [CKBTC_LEDGER]: { did: icrc1Did } })
    await t.loader.load(CKBTC_LEDGER)
    t.canisters[CKBTC_LEDGER] = { did: icrc1Did, hashError: badCertificate() }
    t.advance(RECHECK_MS)
    expect(await t.loader.load(CKBTC_LEDGER)).toMatchObject({
      ok: false,
      code: "trust_error",
    })
  })

  it("loads a canister once for concurrent calls", async () => {
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

describe("a fresh load, for a write", () => {
  it("confirms the module hash however young the cache is", async () => {
    const t = setup({ [CKBTC_LEDGER]: { did: icrc1Did } })
    const first = ok(await t.loader.load(CKBTC_LEDGER))
    t.advance(1)
    const confirmed = ok(await t.loader.load(CKBTC_LEDGER, { fresh: true }))
    expect(confirmed.methods).toBe(first.methods)
    expect(confirmed.loadedAt).toBe(first.loadedAt + 1)
    expect(t.reads).toEqual({ candidAndHash: 1, moduleHash: 1, tmpHack: 0 })
  })

  it("reads the new interface of a module upgraded since the cache", async () => {
    const t = setup({ [CKBTC_LEDGER]: { did: icrc1Did } })
    ok(await t.loader.load(CKBTC_LEDGER))
    t.canisters[CKBTC_LEDGER] = { did: DOC_DID, moduleHash: HASH_B }
    const upgraded = ok(await t.loader.load(CKBTC_LEDGER, { fresh: true }))
    expect(upgraded.did).toBe(DOC_DID)
    expect(upgraded.provenance).toMatchObject({ moduleHash: "b2".repeat(32) })
  })

  it("fails rather than answer from the cache when the module hash cannot be read", async () => {
    const t = setup({ [CKBTC_LEDGER]: { did: icrc1Did } })
    ok(await t.loader.load(CKBTC_LEDGER))
    t.canisters[CKBTC_LEDGER] = { did: icrc1Did, hashError: networkDown() }
    expect(await t.loader.load(CKBTC_LEDGER, { fresh: true })).toMatchObject({
      ok: false,
      code: "network",
    })
    // A plain load still gets the last certified answer while it is young.
    ok(await t.loader.load(CKBTC_LEDGER))
  })

  it("never joins a plain load in flight, which may answer from the cache", async () => {
    const t = setup({ [CKBTC_LEDGER]: { did: icrc1Did } })
    ok(await t.loader.load(CKBTC_LEDGER))
    const [plain, fresh] = await Promise.all([
      t.loader.load(CKBTC_LEDGER),
      t.loader.load(CKBTC_LEDGER, { fresh: true }),
    ])
    expect(plain).not.toBe(fresh)
    expect(t.reads.moduleHash).toBe(1)
  })

  it("never joins another load in flight, a confirming one included", async () => {
    // A confirming load reads the canister after it was asked: one already
    // running may have read it before (before the person approved, say).
    const t = setup({ [CKBTC_LEDGER]: { did: icrc1Did } })
    ok(await t.loader.load(CKBTC_LEDGER))
    const [first, second] = await Promise.all([
      t.loader.load(CKBTC_LEDGER, { fresh: true }),
      t.loader.load(CKBTC_LEDGER, { fresh: true }),
    ])
    expect(first).not.toBe(second)
    expect(t.reads.moduleHash).toBe(2)
  })

  it("keeps what a later load read over what an earlier, slower load stores after it", async () => {
    // A plain load re-checks the module hash and is slow to hear back; the
    // canister is upgraded (a query became an update) and a fresh load reads
    // the new interface; then the slow load lands with the old one.
    const installed = { did: "service : { f : () -> () query }", hash: HASH_A }
    let hold: Promise<void> | undefined
    const source: CandidSource = {
      async readCandidAndHash() {
        return { did: installed.did, moduleHash: installed.hash }
      },
      async readModuleHash() {
        const seen = installed.hash
        const wait = hold
        hold = undefined
        await wait
        return seen
      },
      async readTmpHack() {
        throw noTmpHack()
      },
    }
    let time = 1_000_000
    const loader = createInterfaceLoader({
      source,
      cli: countingCli().cli,
      now: () => time,
    })
    const mode = (result: LoadResult) => ok(result).methods.get("f")?.mode
    expect(mode(await loader.load(CKBTC_LEDGER))).toBe("query")

    time += RECHECK_MS
    let release: () => void = () => {}
    hold = new Promise<void>((resolve) => {
      release = resolve
    })
    const slow = loader.load(CKBTC_LEDGER)
    await vi.waitFor(() => expect(hold).toBeUndefined())
    Object.assign(installed, {
      did: "service : { f : () -> () }",
      hash: HASH_B,
    })
    expect(mode(await loader.load(CKBTC_LEDGER, { fresh: true }))).toBe(
      "update"
    )
    release()
    // The slow load answers with what it read, as of when it read it…
    expect(mode(await slow)).toBe("query")
    // …but the cache keeps the later read.
    time += 1
    expect(mode(await loader.load(CKBTC_LEDGER))).toBe("update")
  })
})

describe("fallbacks and failures", () => {
  it("falls back to the tmp hack query and marks it uncertified", async () => {
    const t = setup({ [CAP_ROUTER]: { did: null, tmpHack: DOC_DID } })
    const iface = ok(await t.loader.load(CAP_ROUTER))
    expect(iface.provenance).toEqual({
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
    expect(await t.loader.load(LIFELINE)).toMatchObject({
      ok: false,
      code: "private_interface",
    })
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
    const iface = ok(await t.loader.load(LIFELINE))
    expect(iface.provenance).toEqual({
      kind: "tmp_hack",
      certified: false,
      moduleHash: "b2".repeat(32),
      reason: "private",
    })
    // The reason survives the cache.
    t.advance(RECHECK_MS - 1)
    const again = ok(await t.loader.load(LIFELINE))
    expect(again.provenance).toMatchObject({ reason: "private" })
    expect(t.reads.tmpHack).toBe(1)
  })

  it("reads a tmp-hack interface again once due, even with the same module hash", async () => {
    const t = setup({ [CAP_ROUTER]: { did: null, tmpHack: DOC_DID } })
    ok(await t.loader.load(CAP_ROUTER))
    t.advance(RECHECK_MS)
    // An uncertified query reply may change without an upgrade.
    ok(await t.loader.load(CAP_ROUTER))
    expect(t.reads.tmpHack).toBe(2)
  })

  it("never falls back after a certificate that does not verify", async () => {
    const t = setup({
      [CKBTC_LEDGER]: { metadataError: badCertificate(), tmpHack: DOC_DID },
    })
    expect(await t.loader.load(CKBTC_LEDGER)).toMatchObject({
      ok: false,
      code: "trust_error",
    })
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
    expect(t.calls.contract).toBe(0)
  })

  it("returns the compiler's diagnostics for a .did that does not compile", async () => {
    const t = setup({ [CKBTC_LEDGER]: { did: "service : { broken" } })
    const result = await t.loader.load(CKBTC_LEDGER)
    expect(result).toMatchObject({ ok: false, code: "compile_failed" })
    if (result.ok) return
    expect(result.diagnostics?.[0]?.code).toBe("did_parse_error")
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
    const t = setup({ [CKBTC_LEDGER]: { metadataError: networkDown() } })
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

  it("bounds a load with its timeout, and remembers that briefly", async () => {
    let reads = 0
    const hanging: CandidSource = {
      readCandidAndHash: () => {
        reads++
        return new Promise(() => {})
      },
      readModuleHash: () => new Promise(() => {}),
      readTmpHack: () => new Promise(() => {}),
    }
    const loader = createInterfaceLoader({
      source: hanging,
      cli: countingCli().cli,
      timeoutMs: 20,
    })
    expect(await loader.load(CKBTC_LEDGER)).toMatchObject({
      ok: false,
      code: "timeout",
    })
    await loader.load(CKBTC_LEDGER)
    expect(reads).toBe(1)
  })

  it("answers with a load that lands after its timeout, not with the timeout", async () => {
    let land: (value: {
      did: string
      moduleHash: Uint8Array
    }) => void = () => {}
    let reads = 0
    const slow: CandidSource = {
      readCandidAndHash: () => {
        reads++
        return new Promise((resolve) => {
          land = resolve
        })
      },
      readModuleHash: async () => HASH_A,
      readTmpHack: () => Promise.reject(noTmpHack()),
    }
    const loader = createInterfaceLoader({
      source: slow,
      cli: countingCli().cli,
      timeoutMs: 20,
    })
    expect(await loader.load(CKBTC_LEDGER)).toMatchObject({ code: "timeout" })
    land({ did: icrc1Did, moduleHash: HASH_A })
    await vi.waitFor(async () => {
      expect((await loader.load(CKBTC_LEDGER)).ok).toBe(true)
    })
    expect(reads).toBe(1)
  })
})

describe("a .did file named for a canister", () => {
  function fileSetup(text: () => string | Promise<string>) {
    const readFile = vi.fn(async (_path: string) => text())
    const t = setup(
      {},
      { files: new Map([[LOCAL_CANISTER, "backend.did"]]), readFile }
    )
    return { ...t, readFile }
  }

  it("reads the file, never the network, and says where the interface came from", async () => {
    const t = fileSetup(() => DOC_DID)
    const iface = ok(await t.loader.load(LOCAL_CANISTER))
    expect(iface).toMatchObject({
      canisterId: LOCAL_CANISTER,
      provenance: { kind: "file", certified: false, path: "backend.did" },
      did: DOC_DID,
      didSha256: sha256(DOC_DID),
      loadedAt: t.now(),
    })
    expect(iface.methods.get("greet")?.doc).toBe(
      "Says hello.\nTwice, if asked."
    )
    expect(t.readFile).toHaveBeenCalledWith("backend.did")
    expect(t.reads).toEqual({ candidAndHash: 0, moduleHash: 0, tmpHack: 0 })
  })

  it("reads the file on every load, so an edit shows at once, and compiles each text once", async () => {
    let text = DOC_DID
    const t = fileSetup(() => text)
    ok(await t.loader.load(LOCAL_CANISTER))
    text = icrc1Did
    expect(
      ok(await t.loader.load(LOCAL_CANISTER)).methods.has("icrc1_fee")
    ).toBe(true)
    ok(await t.loader.load(LOCAL_CANISTER))
    expect(t.readFile).toHaveBeenCalledTimes(3)
    expect(t.calls.contract).toBe(2)
  })

  it("says file_error for a file it cannot read, and remembers no failure of a file", async () => {
    let missing = true
    const t = fileSetup(() => {
      if (missing) throw new Error("ENOENT: no such file or directory")
      return DOC_DID
    })
    expect(await t.loader.load(LOCAL_CANISTER)).toMatchObject({
      ok: false,
      code: "file_error",
      message:
        "Reading the .did file backend.did failed: ENOENT: no such file or directory",
    })
    missing = false
    expect((await t.loader.load(LOCAL_CANISTER)).ok).toBe(true)
  })

  it("applies the size cap to a file", async () => {
    const t = fileSetup(() => `service : {}\n// ${"x".repeat(MAX_DID_BYTES)}`)
    expect(await t.loader.load(LOCAL_CANISTER)).toMatchObject({
      ok: false,
      code: "too_large",
    })
    expect(t.calls.contract).toBe(0)
  })

  it("reads the file from disk by default", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ic-reactor-mcp-"))
    try {
      const path = join(dir, "backend.did")
      await writeFile(path, DOC_DID)
      const missing = join(dir, "missing.did")
      const { source } = fakeSource({})
      const loader = createInterfaceLoader({
        source,
        cli: countingCli().cli,
        files: new Map([
          [LOCAL_CANISTER, path],
          [CKBTC_LEDGER, missing],
        ]),
      })
      expect(ok(await loader.load(LOCAL_CANISTER)).did).toBe(DOC_DID)
      expect(await loader.load(CKBTC_LEDGER)).toMatchObject({
        ok: false,
        code: "file_error",
        message: expect.stringContaining("ENOENT"),
      })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe("methodDid", () => {
  it("gives a method's part of the .did, projected once per .did and method", async () => {
    const t = setup({
      [CKBTC_LEDGER]: { did: icrc1Did },
      [CKETH_LEDGER]: { did: icrc1Did },
    })
    const ckbtc = ok(await t.loader.load(CKBTC_LEDGER))
    const cketh = ok(await t.loader.load(CKETH_LEDGER))
    const part = await t.loader.methodDid(ckbtc, "icrc1_transfer")
    expect(part.ok).toBe(true)
    if (!part.ok) return
    expect(part.did).toContain("icrc1_transfer : (TransferArg)")
    expect(part.did).toContain("type TransferError")
    expect(part.did).not.toContain("icrc1_symbol")
    expect(await t.loader.methodDid(ckbtc, "icrc1_transfer")).toEqual(part)
    expect(await t.loader.methodDid(cketh, "icrc1_transfer")).toEqual(part)
    expect(t.calls.projection).toBe(1)
    await t.loader.methodDid(ckbtc, "icrc1_fee")
    expect(t.calls.projection).toBe(2)
  })

  it("says why a method has no part", async () => {
    const t = setup({ [CKBTC_LEDGER]: { did: icrc1Did } })
    const iface = ok(await t.loader.load(CKBTC_LEDGER))
    expect(await t.loader.methodDid(iface, "no_such_method")).toMatchObject({
      ok: false,
      message: expect.stringMatching(/unknown_method/),
    })
  })

  it("never throws when the compiler cannot run", async () => {
    const { source } = fakeSource({ [CKBTC_LEDGER]: { did: icrc1Did } })
    const loader = createInterfaceLoader({
      source,
      cli: countingCli({
        projectDid: () => Promise.reject(new Error("the WASM trapped")),
      }).cli,
    })
    const iface = ok(await loader.load(CKBTC_LEDGER))
    expect(await loader.methodDid(iface, "icrc1_fee")).toEqual({
      ok: false,
      message: "The compiler could not run: the WASM trapped",
    })
  })
})
