// Compiler answers remembered by the .did text they are about. The live
// loader caches compiled interfaces itself; this serves the server
// functions that compile on request (the TypeScript module, a projection,
// the committed .did check), which would otherwise compile again on every
// request, and the method docs the loader's compile reads from the module.
import type { Sources } from "@candid-core/cli"
import { sha256Hex } from "../lib/hex.ts"
import { Lru } from "./cache.ts"
import { CompileDeadlineError, type CandidCli } from "./compile.ts"
import { TRANSIENT_FAILURE_TTL_MS } from "./live-loader.ts"

const MAX_ENTRIES = 500
/** At most this much JSON (UTF-16, 2 bytes a unit) across the answers. */
const MAX_WEIGHT = 32 * 1024 * 1024
const MAX_SLOW_DIDS = 1_000

export interface CliCacheOptions {
  /** The clock, for tests. */
  now?: () => number
  /**
   * How long a .did is refused after a compile of it ran past the deadline:
   * the parse that made it slow is the same for every call about it, so a
   * new method list would only hold the worker again.
   */
  slowTtlMs?: number
}

/**
 * `cli` with its answers kept: `didToModule` by .did, `projectDid` by .did
 * and set of method names, `checkCompatible` by both .did texts, in an LRU
 * bounded by count and size. A call that throws is not kept, but one
 * stopped at its deadline refuses every call about the same .did for
 * `slowTtlMs`. Calls in flight are shared.
 */
export function cachingCli(
  cli: CandidCli,
  options: CliCacheOptions = {}
): CandidCli {
  const now = options.now ?? Date.now
  const slowTtlMs = options.slowTtlMs ?? TRANSIENT_FAILURE_TTL_MS
  const answers = new Lru<string, { answer: Promise<unknown>; weight: number }>(
    {
      maxEntries: MAX_ENTRIES,
      maxWeight: MAX_WEIGHT,
      weigh: (entry) => entry.weight,
    }
  )
  // .did hash to the time its refusal ends.
  const slow = new Lru<string, number>({ maxEntries: MAX_SLOW_DIDS })

  async function guarded<T>(
    dids: readonly string[],
    work: () => Promise<T>
  ): Promise<T> {
    for (const did of dids) {
      if ((slow.get(did) ?? 0) > now()) {
        throw new CompileDeadlineError(
          `Compiling this interface ran past the server's deadline a moment ago; it is not compiled again for ${slowTtlMs / 1000} s.`
        )
      }
    }
    try {
      return await work()
    } catch (error) {
      if (error instanceof CompileDeadlineError && !error.busy) {
        for (const did of dids) slow.set(did, now() + slowTtlMs)
      }
      throw error
    }
  }

  async function remembered<T>(
    key: string,
    dids: readonly string[],
    work: () => Promise<T>
  ): Promise<T> {
    const known = answers.get(key)
    if (known !== undefined) return known.answer as Promise<T>
    const answer = guarded(dids, work)
    answers.set(key, { answer, weight: 0 })
    try {
      const value = await answer
      // Weighed once it is known; an entry evicted meanwhile stays out.
      if (answers.peek(key)?.answer === answer) {
        answers.set(key, { answer, weight: 2 * JSON.stringify(value).length })
      }
      return value
    } catch (error) {
      if (answers.peek(key)?.answer === answer) answers.delete(key)
      throw error
    }
  }

  return {
    // The loader keeps what it compiles by .did hash; only the deadline
    // refusal applies here.
    didToContract: async (sources) =>
      guarded([await hashOf(sources)], () => cli.didToContract(sources)),
    didToModule: async (sources) => {
      const did = await hashOf(sources)
      return remembered(`module\u0000${did}`, [did], () =>
        cli.didToModule(sources)
      )
    },
    projectDid: async (sources, methods) => {
      const did = await hashOf(sources)
      // The projection depends on the set of names, not their order.
      const names = JSON.stringify([...new Set(methods)].sort())
      return remembered(`project\u0000${did}\u0000${names}`, [did], () =>
        cli.projectDid(sources, methods)
      )
    },
    checkCompatible: async (written, live) => {
      const dids = [await hashOf(written), await hashOf(live)]
      return remembered(`compat\u0000${dids.join("\u0000")}`, dids, () =>
        cli.checkCompatible(written, live)
      )
    },
  }
}

function hashOf(sources: Sources): Promise<string> {
  const text = typeof sources === "string" ? sources : JSON.stringify(sources)
  return sha256Hex(new TextEncoder().encode(text))
}
