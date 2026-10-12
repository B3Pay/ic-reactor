// Canister id in, interface payload out: the read, the fallbacks, the caches.
// Isomorphic: the server wires it to an agent and its own compiler
// (live-candid.server.ts), the browser to an agent and the lazily loaded
// WASM (browser.ts), and tests to a fake source.
import { checkCanisterId } from "../lib/ids.ts"
import { sha256Hex, toHex } from "../lib/hex.ts"
import { Lru } from "./cache.ts"
import {
  tooLarge,
  type CompiledInterface,
  type CompileFailure,
} from "./compile.ts"
import { classifyReadError, type CandidSource } from "./read-candid.ts"
import type { InterfaceErrorCode, InterfacePayload } from "./types.ts"

type OkPayload = Extract<InterfacePayload, { ok: true }>
type FailedPayload = Extract<InterfacePayload, { ok: false }>

export interface LiveLoaderOptions {
  source: CandidSource
  /** Compiles a .did (already within the size cap). */
  compile(did: string): Promise<CompiledInterface | CompileFailure>
  /** Recorded on each payload. */
  compiledIn: "server" | "browser"
  /** The clock, for tests. */
  now?: () => number
  /**
   * The bound on one load, as a timer: it covers the reads, and the compile
   * when that runs off the thread (the server's worker, with a deadline of
   * its own). A compile on this thread (the browser's) holds the timer
   * back until it returns.
   */
  timeoutMs?: number
}

export interface LiveLoader {
  /**
   * The live interface of a canister: its certified `candid:service`, or
   * the uncertified tmp hack query when it publishes none, compiled. Never
   * throws, and never reads a canister id `checkCanisterId` refuses.
   */
  load(canisterId: string): Promise<InterfacePayload>
}

/** How long a canister's (module hash, did) answer is used before re-checking. */
export const CANISTER_TTL_MS = 60_000
/** How long a definitive failure (no interface, not found, …) is remembered. */
export const FAILURE_TTL_MS = 5 * 60_000
/**
 * How long a failure that may pass by itself (network, timeout, a
 * certificate that did not verify) is remembered: long enough to absorb a
 * burst of reloads, short enough not to lock a canister out.
 */
export const TRANSIENT_FAILURE_TTL_MS = 15_000
/** The bound on one load (see `LiveLoaderOptions.timeoutMs`). */
export const LOAD_TIMEOUT_MS = 15_000

const MAX_CANISTERS = 1_000
const MAX_FAILURES = 1_000
/** Compiled interfaces by did hash: ckBTC and ckETH ledgers share one. */
const MAX_DIDS = 200
/** And at most this much text (UTF-16, 2 bytes a unit) across them. */
const MAX_DID_CACHE_BYTES = 64 * 1024 * 1024

const TRANSIENT: ReadonlySet<InterfaceErrorCode> = new Set([
  "network",
  "timeout",
  "trust_error",
  "server_error",
])

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

type FailureEntry = { until: number; payload: FailedPayload }

const encoder = new TextEncoder()

export function createLiveInterfaceLoader(
  options: LiveLoaderOptions
): LiveLoader {
  const { source, compile, compiledIn } = options
  const now = options.now ?? Date.now
  const timeoutMs = options.timeoutMs ?? LOAD_TIMEOUT_MS

  const byCanister = new Lru<string, CanisterEntry>({
    maxEntries: MAX_CANISTERS,
  })
  const byDid = new Lru<string, DidEntry>({
    maxEntries: MAX_DIDS,
    maxWeight: MAX_DID_CACHE_BYTES,
    weigh: (entry) =>
      2 * (entry.did.length + entry.compiled.envelopeJson.length),
  })
  const failures = new Lru<string, FailureEntry>({ maxEntries: MAX_FAILURES })
  const inflight = new Map<string, Promise<InterfacePayload>>()

  const failed = (
    canisterId: string,
    code: InterfaceErrorCode,
    message: string,
    diagnostics?: FailedPayload["diagnostics"]
  ): FailedPayload =>
    diagnostics === undefined
      ? { ok: false, canisterId, code, message }
      : { ok: false, canisterId, code, message, diagnostics }

  const payloadOf = (
    canisterId: string,
    entry: CanisterEntry,
    { did, compiled }: DidEntry,
    cache: OkPayload["cache"]
  ): OkPayload => ({
    ok: true,
    canisterId,
    source:
      entry.source === "metadata"
        ? { kind: "metadata", certified: true, moduleHash: entry.moduleHash }
        : {
            kind: "tmp_hack",
            certified: false,
            moduleHash: entry.moduleHash,
            reason: entry.reason ?? "absent",
          },
    did,
    didSha256: entry.didSha256,
    envelopeJson: compiled.envelopeJson,
    docs: compiled.docs,
    fetchedAt: entry.checkedAt,
    cache,
    interfaceId: compiled.interfaceId,
    compiledIn,
  })

  const remember = (canisterId: string, entry: CanisterEntry): void => {
    byCanister.set(canisterId, entry)
    // A load that outlived its timeout still lands here: drop the timeout
    // it left behind, so the next request gets the answer.
    failures.delete(canisterId)
  }

  // The cached answer while it is fresh, or after its module hash is
  // re-checked unchanged; `undefined` when the interface must be read again.
  async function fromCache(
    canisterId: string
  ): Promise<InterfacePayload | undefined> {
    const hit = byCanister.get(canisterId)
    const didEntry = hit === undefined ? undefined : byDid.get(hit.didSha256)
    if (hit === undefined || didEntry === undefined) return undefined
    if (now() - hit.checkedAt < CANISTER_TTL_MS) {
      return payloadOf(canisterId, hit, didEntry, "hit")
    }
    let moduleHash: Uint8Array | null
    try {
      moduleHash = await source.readModuleHash(canisterId)
    } catch (error) {
      const sorted = classifyReadError(error, "module_hash")
      if (sorted.kind !== "failed") return undefined
      // The last certified answer beats none while the network is down;
      // `fetchedAt` says how old it is. A certificate that does not verify,
      // or a canister that is gone, is never answered from the cache.
      if (sorted.code === "network" || sorted.code === "timeout") {
        return payloadOf(canisterId, hit, didEntry, "hit")
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
    return payloadOf(canisterId, fresh, didEntry, "hit")
  }

  async function readFresh(canisterId: string): Promise<InterfacePayload> {
    let did: string | null = null
    let moduleHash: Uint8Array | null = null
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

    const large = tooLarge(did)
    if (large !== undefined) {
      return failed(canisterId, large.code, large.message)
    }
    const didSha256 = await sha256Hex(encoder.encode(did))
    let didEntry = byDid.get(didSha256)
    if (didEntry === undefined) {
      const compiled = await compile(did)
      if (!compiled.ok) {
        return failed(
          canisterId,
          compiled.code,
          compiled.message,
          compiled.diagnostics
        )
      }
      didEntry = { did, compiled }
      byDid.set(didSha256, didEntry)
    }
    const entry: CanisterEntry = {
      checkedAt: now(),
      moduleHash: toHex(moduleHash),
      didSha256,
      source: kind,
      ...(kind === "tmp_hack"
        ? { reason: isPrivate ? ("private" as const) : ("absent" as const) }
        : {}),
    }
    remember(canisterId, entry)
    return payloadOf(canisterId, entry, didEntry, "miss")
  }

  async function resolve(canisterId: string): Promise<InterfacePayload> {
    try {
      return (await fromCache(canisterId)) ?? (await readFresh(canisterId))
    } catch (error) {
      // The reads never throw past classifyReadError, so this is the
      // compiler that could not run (its WASM missing, or not downloaded)
      // or a bug.
      console.error(`Loading the interface of ${canisterId} failed:`, error)
      if (compiledIn === "server") {
        // Its text can carry the server's file paths: it stays in the log.
        return failed(
          canisterId,
          "server_error",
          "The studio's server failed while loading this interface; its log has the details."
        )
      }
      // In a browser, most likely the compiler's download.
      const message = error instanceof Error ? error.message : String(error)
      return failed(
        canisterId,
        "network",
        `Loading the interface failed in this browser: ${message.slice(0, 300)}`
      )
    }
  }

  function load(canisterId: string): Promise<InterfacePayload> {
    const id = checkCanisterId(canisterId)
    if (!id.ok) return Promise.resolve(failed(canisterId, id.code, id.message))
    const known = failures.get(canisterId)
    if (known !== undefined && known.until > now())
      return Promise.resolve(known.payload)
    const running = inflight.get(canisterId)
    if (running !== undefined) return running

    const promise = withTimeout(resolve(canisterId), timeoutMs, () =>
      failed(
        canisterId,
        "timeout",
        `Loading the interface took longer than ${timeoutMs / 1000} s.`
      )
    )
      .then((payload) => {
        if (!payload.ok) {
          const ttl = TRANSIENT.has(payload.code)
            ? TRANSIENT_FAILURE_TTL_MS
            : FAILURE_TTL_MS
          failures.set(canisterId, { until: now() + ttl, payload })
        }
        return payload
      })
      .finally(() => inflight.delete(canisterId))
    inflight.set(canisterId, promise)
    return promise
  }

  return { load }
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
