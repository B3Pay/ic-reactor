// Canister id in, interface out: the read, the fallbacks, the caches. The
// server wires it to an agent for its network (`agentCandidSource`) and,
// by default, a compiler worker of its own; tests to a fake source.
import { readFile as readTextFile } from "node:fs/promises"
import { Lru } from "./cache.ts"
import { cachingCli } from "./cli-cache.ts"
import {
  compileInterface,
  projectionOf,
  tooLarge,
  type CandidCli,
  type CompiledInterface,
  type CompileFailure,
} from "./compile.ts"
import { createWorkerCli, type WorkerCli } from "./compile-worker.ts"
import { sha256Hex, toHex } from "./hex.ts"
import { checkCanisterId } from "./ids.ts"
import { classifyReadError, type CandidSource } from "./read-candid.ts"
import type {
  CanisterInterface,
  InterfaceErrorCode,
  InterfaceLoader,
  InterfaceProvenance,
  LoadOptions,
  LoadResult,
} from "./types.ts"

export interface LoaderOptions {
  /** Where canister .did text comes from: `agentCandidSource(agent)`, or a fake in tests. */
  readonly source: CandidSource
  /**
   * The compiler: by default a worker thread whose calls stop after 2 s,
   * which `close()` stops. A compiler passed here is the caller's to close.
   */
  readonly cli?: CandidCli
  /** Canister id to a .did path the person named (`--did`), read instead of the network. */
  readonly files?: ReadonlyMap<string, string>
  /** Reads a `files` path (default: the file's text as UTF-8). */
  readonly readFile?: (path: string) => Promise<string>
  readonly now?: () => number
  /**
   * How long a loaded interface is used before its module hash is read
   * again (default 60 s); 0 reads it on every load.
   */
  readonly recheckMs?: number
  /** The bound on one load, reads and compile together (default 15 s). */
  readonly timeoutMs?: number
}

/** How long a canister's interface is used before its module hash is re-checked. */
export const RECHECK_MS = 60_000
/** How long a failure that will not change soon (no interface, not found, …) is remembered. */
export const FAILURE_TTL_MS = 5 * 60_000
/**
 * How long a failure that may pass by itself (network, timeout, a
 * certificate that did not verify, a compiler that could not run) is
 * remembered: long enough to absorb a burst of calls, short enough not to
 * lock a canister out.
 */
export const TRANSIENT_FAILURE_TTL_MS = 15_000
/** The bound on one load (see `LoaderOptions.timeoutMs`). */
export const LOAD_TIMEOUT_MS = 15_000

const MAX_CANISTERS = 1_000
const MAX_FAILURES = 1_000
/** Compiled interfaces by did hash: ckBTC and ckETH ledgers share one. */
const MAX_DIDS = 200
/** And about this much heap across them (see `HEAP_PER_ENVELOPE_CHAR`). */
const MAX_DID_CACHE_BYTES = 64 * 1024 * 1024
/**
 * The heap a compiled interface holds (its schemas and methods), per
 * character of its envelope's JSON. Measured on Node 22: 400 KiB for the NNS
 * governance interface (72,185 characters, 5.7 a character), 172 KiB for
 * the ICP ledger's (23,446, 7.5). The larger, rounded up: the cap is a
 * bound, not an average.
 */
const HEAP_PER_ENVELOPE_CHAR = 8

const TRANSIENT: ReadonlySet<InterfaceErrorCode> = new Set([
  "network",
  "timeout",
  "trust_error",
])

type Failure = Extract<LoadResult, { ok: false }>

/** What one load found, and how long a failure of it is remembered (ms, 0: not at all). */
type Outcome = { result: LoadResult; ttl: number }

type CanisterEntry = {
  /** When the module hash was last confirmed against the canister. */
  checkedAt: number
  /** Hex; a canister with no module never gets an entry. */
  moduleHash: string
  didSha256: string
  source: "metadata" | "tmp_hack"
  /** For the tmp hack: why the metadata was not used. */
  reason?: "absent" | "private"
}

type DidEntry = { did: string; compiled: CompiledInterface }

/**
 * The interface loader: a canister's certified `candid:service` metadata,
 * the uncertified tmp hack query when the certificate proves there is none
 * (or it is private), or the .did file the person named for it; compiled,
 * and cached by module hash. `load` never throws, and never reads anything
 * for a canister id `checkCanisterId` refuses.
 */
export function createInterfaceLoader(options: LoaderOptions): InterfaceLoader {
  const { source } = options
  const files = options.files ?? new Map<string, string>()
  const readFile =
    options.readFile ?? ((path: string) => readTextFile(path, "utf8"))
  const now = options.now ?? Date.now
  const recheckMs = options.recheckMs ?? RECHECK_MS
  const timeoutMs = options.timeoutMs ?? LOAD_TIMEOUT_MS
  // A worker of the loader's own unless a compiler is given: `close()` stops
  // only that one. It starts on the first compile.
  const worker: WorkerCli | undefined =
    options.cli === undefined ? createWorkerCli() : undefined
  const cli = cachingCli(options.cli ?? (worker as WorkerCli), {
    now,
    slowTtlMs: TRANSIENT_FAILURE_TTL_MS,
  })

  const byCanister = new Lru<string, CanisterEntry>({
    maxEntries: MAX_CANISTERS,
  })
  const byDid = new Lru<string, DidEntry>({
    maxEntries: MAX_DIDS,
    maxWeight: MAX_DID_CACHE_BYTES,
    // The .did text (UTF-16, 2 bytes a unit) and the schemas built from it.
    weigh: (entry) =>
      2 * entry.did.length +
      HEAP_PER_ENVELOPE_CHAR * entry.compiled.envelopeLength,
  })
  const failures = new Lru<string, { until: number; result: Failure }>({
    maxEntries: MAX_FAILURES,
  })
  const inflight = new Map<string, Promise<LoadResult>>()
  const compiling = new Map<
    string,
    Promise<CompiledInterface | CompileFailure>
  >()

  const failed = (
    canisterId: string,
    code: InterfaceErrorCode,
    message: string,
    diagnostics?: Failure["diagnostics"]
  ): Failure =>
    diagnostics === undefined
      ? { ok: false, canisterId, code, message }
      : { ok: false, canisterId, code, message, diagnostics }

  const loaded = (
    canisterId: string,
    provenance: InterfaceProvenance,
    didSha256: string,
    { did, compiled }: DidEntry,
    loadedAt: number
  ): LoadResult => ({
    ok: true,
    iface: {
      canisterId,
      provenance,
      did,
      didSha256,
      interfaceId: compiled.interfaceId,
      actor: compiled.actor,
      methods: compiled.methods,
      omitted: compiled.omitted,
      loadedAt,
    } satisfies CanisterInterface,
  })

  const fromEntry = (canisterId: string, entry: CanisterEntry, did: DidEntry) =>
    loaded(
      canisterId,
      entry.source === "metadata"
        ? { kind: "metadata", certified: true, moduleHash: entry.moduleHash }
        : {
            kind: "tmp_hack",
            certified: false,
            moduleHash: entry.moduleHash,
            reason: entry.reason ?? "absent",
          },
      entry.didSha256,
      did,
      entry.checkedAt
    )

  const remember = (canisterId: string, entry: CanisterEntry): void => {
    byCanister.set(canisterId, entry)
    // A load that outlived its timeout still lands here: drop the timeout
    // it left behind, so the next call gets the answer.
    failures.delete(canisterId)
  }

  // The compiled interface of a .did, by its hash: compiled once for every
  // canister (and file) that has it, and once for loads that ask together.
  async function compiled(
    canisterId: string,
    did: string
  ): Promise<{ didSha256: string; entry: DidEntry } | Failure> {
    const large = tooLarge(did)
    if (large !== undefined) {
      return failed(canisterId, large.code, large.message)
    }
    const didSha256 = sha256Hex(did)
    const known = byDid.get(didSha256)
    if (known !== undefined) return { didSha256, entry: known }
    let pending = compiling.get(didSha256)
    if (pending === undefined) {
      pending = compileInterface(cli, did).finally(() =>
        compiling.delete(didSha256)
      )
      compiling.set(didSha256, pending)
    }
    const result = await pending
    if (!result.ok) {
      return failed(canisterId, result.code, result.message, result.diagnostics)
    }
    const entry = { did, compiled: result }
    byDid.set(didSha256, entry)
    return { didSha256, entry }
  }

  // The cached answer while it is fresh, or after its module hash is
  // re-checked unchanged; `undefined` when the interface must be read again.
  // `confirm` re-checks the hash whatever the entry's age, and never falls
  // back to the cache when that read fails.
  async function fromCache(
    canisterId: string,
    confirm: boolean
  ): Promise<LoadResult | undefined> {
    const hit = byCanister.get(canisterId)
    const didEntry = hit === undefined ? undefined : byDid.get(hit.didSha256)
    if (hit === undefined || didEntry === undefined) return undefined
    if (!confirm && now() - hit.checkedAt < recheckMs) {
      return fromEntry(canisterId, hit, didEntry)
    }
    // An uncertified tmp-hack answer is a query's reply, which may change
    // with the canister's state, not only on an upgrade: past its TTL it is
    // read again rather than renewed by an unchanged module hash.
    if (hit.source === "tmp_hack") return undefined
    let moduleHash: Uint8Array | null
    try {
      moduleHash = await source.readModuleHash(canisterId)
    } catch (error) {
      const sorted = classifyReadError(error, "module_hash")
      if (sorted.kind !== "failed") return undefined
      // The last certified answer beats none while the network is down;
      // `loadedAt` says how old it is. A certificate that does not verify,
      // or a canister that is gone, is never answered from the cache.
      if (
        !confirm &&
        (sorted.code === "network" || sorted.code === "timeout")
      ) {
        return fromEntry(canisterId, hit, didEntry)
      }
      return failed(canisterId, sorted.code, sorted.message)
    }
    // Metadata are custom sections of the module: the same module hash is
    // the same interface, so nothing is read or compiled again.
    if (moduleHash === null || toHex(moduleHash) !== hit.moduleHash) {
      return undefined
    }
    const fresh = { ...hit, checkedAt: now() }
    remember(canisterId, fresh)
    return fromEntry(canisterId, fresh, didEntry)
  }

  async function readFresh(canisterId: string): Promise<LoadResult> {
    let did: string | null = null
    let moduleHash: Uint8Array | null
    let isPrivate = false
    try {
      ;({ did, moduleHash } = await source.readCandidAndHash(canisterId))
    } catch (error) {
      const sorted = classifyReadError(error, "metadata")
      if (sorted.kind === "failed") {
        return failed(canisterId, sorted.code, sorted.message)
      }
      // A private candid:service refuses the whole request, module hash
      // included: read the hash alone.
      isPrivate = true
      try {
        moduleHash = await source.readModuleHash(canisterId)
      } catch (hashError) {
        const hashSorted = classifyReadError(hashError, "module_hash")
        return hashSorted.kind === "failed"
          ? failed(canisterId, hashSorted.code, hashSorted.message)
          : failed(canisterId, "network", "Reading the module hash failed.")
      }
    }
    if (moduleHash === null) {
      return failed(
        canisterId,
        "no_interface",
        "This canister has no module installed, so it has no interface."
      )
    }

    let kind: CanisterEntry["source"] = "metadata"
    if (did === null) {
      try {
        did = await source.readTmpHack(canisterId)
        kind = "tmp_hack"
      } catch (error) {
        const sorted = classifyReadError(error, "tmp_hack")
        if (sorted.kind === "failed") {
          return failed(canisterId, sorted.code, sorted.message)
        }
        return isPrivate
          ? failed(
              canisterId,
              "private_interface",
              "This canister's candid:service metadata is readable by its controllers only, and it has no __get_candid_interface_tmp_hack query."
            )
          : failed(
              canisterId,
              "no_interface",
              "This canister publishes no candid:service metadata and has no __get_candid_interface_tmp_hack query."
            )
      }
    }

    const found = await compiled(canisterId, did)
    if ("ok" in found) return found
    const entry: CanisterEntry = {
      checkedAt: now(),
      moduleHash: toHex(moduleHash),
      didSha256: found.didSha256,
      source: kind,
      ...(kind === "tmp_hack"
        ? { reason: isPrivate ? ("private" as const) : ("absent" as const) }
        : {}),
    }
    remember(canisterId, entry)
    return fromEntry(canisterId, entry, found.entry)
  }

  // A canister the person named a .did file for: the file, read on every
  // load (an edit shows at once; its compile is cached by .did hash), and
  // never the network.
  async function readFromFile(
    canisterId: string,
    path: string
  ): Promise<LoadResult> {
    let did: string
    try {
      did = await readFile(path)
    } catch (error) {
      return failed(
        canisterId,
        "file_error",
        `Reading the .did file ${path} failed: ${messageOf(error)}`
      )
    }
    const loadedAt = now()
    const found = await compiled(canisterId, did)
    if ("ok" in found) return found
    return loaded(
      canisterId,
      { kind: "file", certified: false, path },
      found.didSha256,
      found.entry,
      loadedAt
    )
  }

  async function resolve(
    canisterId: string,
    confirm: boolean
  ): Promise<Outcome> {
    const path = files.get(canisterId)
    try {
      const result =
        path !== undefined
          ? await readFromFile(canisterId, path)
          : ((await fromCache(canisterId, confirm)) ??
            (await readFresh(canisterId)))
      return { result, ttl: failureTtl(result, path) }
    } catch (error) {
      // The reads never throw past classifyReadError, so this is the
      // compiler that could not run (a worker that cannot start, a trap of
      // the WASM) or a bug: not a fact about the canister.
      return {
        result: failed(
          canisterId,
          "compile_failed",
          `The compiler could not run: ${messageOf(error)}`
        ),
        ttl: path === undefined ? TRANSIENT_FAILURE_TTL_MS : 0,
      }
    }
  }

  // A file's failures are not remembered: the person may be fixing it.
  function failureTtl(result: LoadResult, path: string | undefined): number {
    if (result.ok || path !== undefined) return 0
    return TRANSIENT.has(result.code)
      ? TRANSIENT_FAILURE_TTL_MS
      : FAILURE_TTL_MS
  }

  function load(
    canisterId: string,
    options: LoadOptions = {}
  ): Promise<LoadResult> {
    const id = checkCanisterId(canisterId)
    if (!id.ok) return Promise.resolve(failed(canisterId, id.code, id.message))
    const known = failures.get(canisterId)
    if (known !== undefined && known.until > now()) {
      return Promise.resolve(known.result)
    }
    // A confirming load never joins one that may answer from the cache.
    const confirm = options.fresh === true
    const key = confirm ? `${canisterId} fresh` : canisterId
    const running = inflight.get(key)
    if (running !== undefined) return running

    const promise = withTimeout(
      resolve(canisterId, confirm),
      timeoutMs,
      () => ({
        result: failed(
          canisterId,
          "timeout",
          `Loading the interface took longer than ${timeoutMs / 1000} s.`
        ),
        ttl: files.has(canisterId) ? 0 : TRANSIENT_FAILURE_TTL_MS,
      })
    )
      .then(({ result, ttl }) => {
        // A confirming load's failure is not remembered: the plain loads
        // after it may still answer from the cache.
        if (!result.ok && ttl > 0 && !confirm) {
          failures.set(canisterId, { until: now() + ttl, result })
        }
        return result
      })
      .finally(() => inflight.delete(key))
    inflight.set(key, promise)
    return promise
  }

  async function methodDid(
    iface: CanisterInterface,
    method: string
  ): Promise<{ ok: true; did: string } | { ok: false; message: string }> {
    try {
      // Through `cli`, whose cache keys a projection by the .did's hash
      // (`didSha256`) and the method.
      const projection = await projectionOf(cli, iface.did, [method])
      return projection.ok
        ? { ok: true, did: projection.did }
        : { ok: false, message: projection.message }
    } catch (error) {
      return {
        ok: false,
        message: `The compiler could not run: ${messageOf(error)}`,
      }
    }
  }

  return {
    load,
    methodDid,
    async close() {
      await worker?.close()
    },
  }
}

function withTimeout<T>(
  work: Promise<T>,
  ms: number,
  onTimeout: () => T
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(onTimeout()), ms)
  })
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer))
}

function messageOf(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  return text.split("\n")[0]?.slice(0, 300) ?? ""
}
