#!/usr/bin/env node
/**
 * Measures what `maxDepth` costs the codec at 256, 1,024 and 10,000 levels of
 * nesting, in a worker thread.
 *
 * DECISIONS Q17 keeps the client's `maxDepth` at the codec's default of 256
 * and says to measure the refusal work before beta.1 and to raise the default
 * only on evidence. A reply deeper than `maxDepth` is refused by the decoder,
 * and a client that raises the limit (for an ICRC-3 block log, say) accepts
 * what the canister sent however deep. The two numbers that decide it are
 * what a hostile or buggy reply costs the page when the limit refuses it, and
 * what an honest deep reply costs when the limit is raised to take it.
 *
 * For each depth `D` the script builds a value that is `D` levels deep as the
 * codec counts them (a `vec` of itself, which costs two levels per nesting,
 * inside an `opt` when `D` is even; the script checks the count) with
 * `@candid-core/schema`'s builders, encodes it, and then, in a
 * `node:worker_threads` worker so that the main thread's own work is out of
 * the measurement, times `decodeArgs`
 *
 * - with the default `maxDepth` of 256, which refuses what is deeper, and
 * - with `maxDepth` raised to `D`, which accepts it,
 *
 * and says whether each refused, with what, and how deep the walk had got when
 * it did. Each time is the median of several runs after a warm-up. It also
 * finds the smallest `maxDepth` that accepts the value, which must be `D`: the
 * script fails if the value is not the depth it says. This is a measurement to
 * read, not a gate: nothing here fails on a number.
 *
 * Usage
 *   node scripts/bench-max-depth.mjs [--depths 256,1024,10000] [--runs 25] [--json]
 */
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import {
  Worker,
  isMainThread,
  parentPort,
  workerData,
} from "node:worker_threads"

const here = dirname(fileURLToPath(import.meta.url))

/** The depths DECISIONS Q17 names. */
const DEFAULT_DEPTHS = [256, 1_024, 10_000]

/** How many timed runs per measurement, after {@link WARMUP} untimed ones. */
const DEFAULT_RUNS = 25
const WARMUP = 5

/** About how long one timed sample runs, in milliseconds. */
const SAMPLE_MS = 5

// ── In the worker ────────────────────────────────────────────────────────────

/** The median, minimum and maximum of `samples`, in milliseconds. */
function summarize(samples) {
  const sorted = [...samples].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  const median =
    sorted.length % 2 === 1
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2
  return { median, min: sorted[0], max: sorted[sorted.length - 1] }
}

/**
 * Runs `work` untimed for a warm-up, then times `runs` samples; returns their
 * summary and the last result. A call is often well under a millisecond, so a
 * sample is the mean of a batch of calls that takes about `SAMPLE_MS`, which
 * keeps the clock's resolution out of the number.
 */
function measure(work, runs) {
  let result
  for (let i = 0; i < WARMUP; i += 1) result = work()
  let batch = 1
  for (;;) {
    const start = performance.now()
    for (let i = 0; i < batch; i += 1) result = work()
    const elapsed = performance.now() - start
    if (elapsed >= SAMPLE_MS || batch >= 1_000_000) break
    batch *= elapsed < SAMPLE_MS / 10 ? 10 : 2
  }
  const samples = []
  for (let i = 0; i < runs; i += 1) {
    const start = performance.now()
    for (let call = 0; call < batch; call += 1) result = work()
    samples.push((performance.now() - start) / batch)
  }
  return { ...summarize(samples), result }
}

/** What a decode ended with, for the report: accepted, or the first issue it refused with. */
function outcomeOf(result) {
  if (result.ok) return { refused: false }
  const [first] = result.issues
  return {
    refused: true,
    code: first?.code,
    resource: first?.resource_limit?.resource,
    limit: first?.resource_limit?.limit,
    observed: first?.resource_limit?.observed,
  }
}

async function runInWorker({ schemaUrl, codecUrl, depths, runs }) {
  const { c } = await import(schemaUrl)
  const { DEFAULT_MAX_DEPTH, decodeArgs, encodeArgs } = await import(codecUrl)
  /** A vec of itself: `[]`, `[[]]`, `[[[]]]`. Each nesting is two levels to the codec. */
  const Nest = c.rec(() => c.vec(Nest))
  /** An opt around it adds the one level that makes an even depth. */
  const Even = c.opt(Nest)

  const rows = []
  for (const depth of depths) {
    // `n` nestings are `2n - 1` levels, and `opt` adds one: `ceil(depth / 2)`
    // nestings, in an opt when the depth is even. Built without recursion, so
    // that building the value is not what runs out of stack at ten thousand
    // levels.
    const schema = depth % 2 === 0 ? Even : Nest
    let value = []
    for (let nesting = 1; nesting < Math.ceil(depth / 2); nesting += 1) {
      value = [value]
    }

    const raised = depth + 16
    const encoding = measure(
      () => encodeArgs([schema], [value], { maxDepth: raised }),
      runs
    )
    if (!encoding.result.ok) {
      throw new Error(
        `could not encode a value ${depth} levels deep: ${JSON.stringify(encoding.result.issues[0]).slice(0, 200)}`
      )
    }
    const bytes = encoding.result.bytes

    const atDefault = measure(() => decodeArgs([schema], bytes), runs)
    const atDepth = measure(
      () => decodeArgs([schema], bytes, { maxDepth: depth }),
      runs
    )

    // The smallest maxDepth that accepts it: the number the limit counts.
    let low = 0
    let high = depth + 16
    while (low + 1 < high) {
      const mid = Math.floor((low + high) / 2)
      if (decodeArgs([schema], bytes, { maxDepth: mid }).ok) high = mid
      else low = mid
    }

    if (high !== depth) {
      throw new Error(
        `the value built for depth ${depth} is ${high} levels deep to the codec`
      )
    }

    rows.push({
      depth,
      bytes: bytes.length,
      smallestAcceptingMaxDepth: high,
      encodeMs: encoding.median,
      atDefault: {
        maxDepth: DEFAULT_MAX_DEPTH,
        ...outcomeOf(atDefault.result),
        median: atDefault.median,
        min: atDefault.min,
        max: atDefault.max,
      },
      atDepth: {
        maxDepth: depth,
        ...outcomeOf(atDepth.result),
        median: atDepth.median,
        min: atDepth.min,
        max: atDepth.max,
      },
    })
  }
  return rows
}

// ── On the main thread ───────────────────────────────────────────────────────

/** Parses `--depths a,b,c`, `--runs n` and `--json`. */
export function parseArgs(argv) {
  const options = { depths: DEFAULT_DEPTHS, runs: DEFAULT_RUNS, json: false }
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]
    if (flag === "--json") options.json = true
    else if (flag === "--depths") {
      options.depths = (argv[(i += 1)] ?? "").split(",").map(Number)
    } else if (flag === "--runs") options.runs = Number(argv[(i += 1)])
    else throw new Error(`unknown argument ${flag}`)
  }
  if (
    options.depths.length === 0 ||
    options.depths.some((depth) => !Number.isSafeInteger(depth) || depth < 1)
  ) {
    throw new Error(
      "--depths takes a comma-separated list of positive integers"
    )
  }
  if (!Number.isSafeInteger(options.runs) || options.runs < 1) {
    throw new Error("--runs takes a positive integer")
  }
  return options
}

/** A time in milliseconds, with the digits that mean something at its size. */
const fixed = (ms) =>
  ms < 1 ? ms.toFixed(4) : ms < 10 ? ms.toFixed(3) : ms.toFixed(1)

function describeOutcome(outcome) {
  return outcome.refused
    ? `refused at ${outcome.observed ?? "?"} (${outcome.resource ?? outcome.code})`
    : "accepted"
}

/** Prints the rows as an aligned table, and what to read from it. */
function report(rows, runs) {
  console.log(
    `maxDepth work in a worker thread: median of ${runs} samples, in milliseconds, node ${process.version}\n`
  )
  const table = [
    ["depth", "bytes", "encode", "decode at 256", "", "decode at depth", ""],
    ...rows.map((row) => [
      String(row.depth),
      String(row.bytes),
      fixed(row.encodeMs),
      fixed(row.atDefault.median),
      describeOutcome(row.atDefault),
      fixed(row.atDepth.median),
      describeOutcome(row.atDepth),
    ]),
  ]
  const widths = table[0].map((_, column) =>
    Math.max(...table.map((cells) => cells[column].length))
  )
  for (const cells of table) {
    console.log(
      cells
        .map((cell, column) => cell.padEnd(widths[column]))
        .join("  ")
        .trimEnd()
    )
  }
  console.log(
    "\nA refusal is the codec stopping at the limit: its work stays near the cost of " +
      "the first 256 levels however deep the input goes. Accepting a value costs " +
      "time in proportion to its depth."
  )
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const requireFromCore = createRequire(
    join(here, "..", "packages", "core", "package.json")
  )
  const worker = new Worker(fileURLToPath(import.meta.url), {
    workerData: {
      schemaUrl: pathToFileURL(requireFromCore.resolve("@candid-core/schema"))
        .href,
      codecUrl: pathToFileURL(
        requireFromCore.resolve("@candid-core/schema/codec")
      ).href,
      depths: options.depths,
      runs: options.runs,
    },
  })
  const rows = await new Promise((resolve, reject) => {
    worker.once("message", resolve)
    worker.once("error", reject)
    worker.once("exit", (code) => {
      if (code !== 0) reject(new Error(`the worker exited with code ${code}`))
    })
  })
  if (options.json) console.log(JSON.stringify(rows, null, 2))
  else report(rows, options.runs)
}

if (isMainThread) {
  if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href
  ) {
    await main()
  }
} else {
  parentPort.postMessage(await runInWorker(workerData))
}
