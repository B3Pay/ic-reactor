// Compiler answers remembered by the .did text they are about. The loader
// caches compiled interfaces itself (by .did hash); this keeps the
// projections `methodDid` asks for, one per .did and set of methods, and
// keeps a .did whose compile ran past the deadline from holding the worker
// again and again.
import type { Sources } from "@meantjs/cli"
import { Lru } from "./cache.ts"
import type { CandidCli } from "./compile.ts"
import { CompileDeadlineError } from "./compile-worker.ts"
import { sha256Hex } from "./hex.ts"

const MAX_ENTRIES = 500
/** At most this much JSON (UTF-16, 2 bytes a unit) across the answers. */
const MAX_WEIGHT = 32 * 1024 * 1024
const MAX_SLOW_DIDS = 1_000
/** The loader's TTL for a transient failure, which a deadline is. */
const SLOW_TTL_MS = 15_000

export interface CliCacheOptions {
  /** The clock, for tests. */
  readonly now?: () => number
  /**
   * How long a .did is refused after a compile of it ran past the deadline:
   * the parse that made it slow is the same for every call about it, so a
   * new method list would only hold the worker again.
   */
  readonly slowTtlMs?: number
}

/**
 * `cli` with its projections kept: `projectDid` by .did and set of method
 * names, in an LRU bounded by count and size, a call in flight shared. A
 * call that throws is not kept, but one stopped at its deadline refuses
 * every call about the same .did for `slowTtlMs`, whichever function it is.
 */
export function cachingCli(
  cli: CandidCli,
  options: CliCacheOptions = {}
): CandidCli {
  const now = options.now ?? Date.now
  const slowTtlMs = options.slowTtlMs ?? SLOW_TTL_MS
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
    // The loader keeps what these give by .did hash; only the deadline
    // refusal applies here.
    didToContract: (sources) =>
      guarded([hashOf(sources)], () => cli.didToContract(sources)),
    didToModule: (sources) =>
      guarded([hashOf(sources)], () => cli.didToModule(sources)),
    projectDid: (sources, methods) => {
      const did = hashOf(sources)
      // The projection depends on the set of names, not their order.
      const names = JSON.stringify([...new Set(methods)].sort())
      return remembered(`${did}\u0000${names}`, [did], () =>
        cli.projectDid(sources, methods)
      )
    },
    checkCompatible: (written, live) =>
      guarded([hashOf(written), hashOf(live)], () =>
        cli.checkCompatible(written, live)
      ),
  }
}

// The key of a .did: for text, its `didSha256`.
function hashOf(sources: Sources): string {
  return sha256Hex(
    typeof sources === "string" ? sources : JSON.stringify(sources)
  )
}
