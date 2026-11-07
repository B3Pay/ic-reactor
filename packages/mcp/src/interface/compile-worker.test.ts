// The compiler in its worker thread, over the real WASM (offline): the
// deadline that stops a hostile .did, the event loop it keeps free, a worker
// that cannot start, and a process it never keeps alive.
import { execFile } from "node:child_process"
import { readFile } from "node:fs/promises"
import { promisify } from "node:util"
import { afterEach, describe, expect, it, vi } from "vitest"
import { compileInterface, MAX_DID_BYTES, utf8Length } from "./compile.ts"
import {
  CompileDeadlineError,
  createWorkerCli,
  type WorkerCli,
  type WorkerCliOptions,
} from "./compile-worker.ts"
import { createInterfaceLoader, TRANSIENT_FAILURE_TTL_MS } from "./loader.ts"
import type { CandidSource } from "./read-candid.ts"

const icrc1Did = await readFile(
  new URL("./fixtures/icrc1.did", import.meta.url),
  "utf8"
)

const CKBTC_LEDGER = "mxzaz-hqaaa-aaaar-qaada-cai"
const HASH = new Uint8Array(32).fill(0xa1)
const MISSING_WASM = "/srv/missing/candid_core_wasm_bg.wasm"

// The slowest shape found within the cap: 19,516 methods `m<i> : () -> ()`,
// 262,134 bytes, which the compiler takes 2.5 s over (5 s with the docs).
const HOSTILE_DID = `service : {\n/// d\n${Array.from(
  { length: 19_516 },
  (_, i) => `m${i}:()->();`
).join("")}\n}`

const opened: WorkerCli[] = []

function workerCli(options?: WorkerCliOptions): WorkerCli {
  const cli = createWorkerCli(options)
  opened.push(cli)
  return cli
}

afterEach(async () => {
  await Promise.all(opened.splice(0).map((cli) => cli.close()))
})

/** Counts timer ticks while `work` runs: zero means the event loop was held. */
async function ticksDuring<T>(work: () => Promise<T>): Promise<[T, number]> {
  let ticks = 0
  const timer = setInterval(() => ticks++, 10)
  try {
    return [await work(), ticks]
  } finally {
    clearInterval(timer)
  }
}

function sourceOf(did: string): CandidSource & { reads: number } {
  const source = {
    reads: 0,
    async readCandidAndHash() {
      source.reads++
      return { did, moduleHash: HASH }
    },
    async readModuleHash() {
      return HASH
    },
    async readTmpHack(): Promise<string> {
      throw new Error("no tmp hack read expected")
    },
  }
  return source
}

describe("the worker compiler", () => {
  it("compiles in the worker, one call after another", async () => {
    const cli = workerCli()
    const [a, b, c] = await Promise.all([
      cli.didToContract(icrc1Did),
      cli.didToModule(icrc1Did),
      cli.projectDid(icrc1Did, ["icrc1_fee"]),
    ])
    expect("contract" in a).toBe(true)
    expect(b).toMatchObject({ ok: true })
    expect(c).toMatchObject({ ok: true, methods: ["icrc1_fee"] })
  })

  it("stops a hostile .did at its deadline without holding the event loop, then starts afresh", async () => {
    expect(utf8Length(HOSTILE_DID)).toBeLessThanOrEqual(MAX_DID_BYTES)
    const cli = workerCli({ deadlineMs: 300 })
    // Started and warm, so the deadline times the compile alone.
    await cli.didToContract("service : {}")

    const started = performance.now()
    const [outcome, ticks] = await ticksDuring(() =>
      cli.didToContract(HOSTILE_DID).then(
        () => "compiled",
        (error: unknown) => error
      )
    )
    const took = performance.now() - started
    expect(outcome).toBeInstanceOf(CompileDeadlineError)
    expect(took).toBeLessThan(1_500)
    expect(ticks).toBeGreaterThan(10)

    expect(
      await cli.didToContract("service : { ping : () -> (text) query }")
    ).toHaveProperty("contract")
  })

  it("makes the deadline a timeout failure of compileInterface", async () => {
    const cli = workerCli({ deadlineMs: 300 })
    expect(await compileInterface(cli, HOSTILE_DID)).toMatchObject({
      ok: false,
      code: "timeout",
      message: expect.stringMatching(/stopped it/),
    })
  })

  it("refuses a call while the queue is full", async () => {
    const cli = workerCli({ maxQueued: 0 })
    const error: unknown = await cli.didToContract(icrc1Did).catch((e) => e)
    expect(error).toBeInstanceOf(CompileDeadlineError)
    expect(error).toMatchObject({ busy: true })
  })

  it("fails the calls it holds and has queued when closed, and starts afresh after", async () => {
    const cli = workerCli()
    await cli.didToContract("service : {}")
    const running = cli.didToContract(HOSTILE_DID).catch((e: unknown) => e)
    const queued = cli.didToModule(icrc1Did).catch((e: unknown) => e)
    await cli.close()
    expect(await running).toMatchObject({
      message: expect.stringMatching(/closed/),
    })
    expect(await queued).toMatchObject({
      message: expect.stringMatching(/closed/),
    })
    expect(await cli.didToContract(icrc1Did)).toHaveProperty("contract")
  })

  it("never keeps a process alive once its calls are done", async () => {
    // Node loads the module from its TypeScript source: by default from
    // 22.18, with the flag on the 22.12 floor.
    const module = new URL("./compile-worker.ts", import.meta.url).href
    const script = `
      const { createWorkerCli } = await import(${JSON.stringify(module)})
      const reply = await createWorkerCli().didToContract("service : {}")
      console.log("contract" in reply)
    `
    const flags =
      process.features.typescript === false
        ? ["--experimental-strip-types"]
        : []
    // A process the worker held is killed at the timeout, and this rejects.
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [...flags, "--no-warnings", "--input-type=module", "--eval", script],
      { timeout: 10_000 }
    )
    expect(stdout.trim()).toBe("true")
  }, 15_000)

  it("fails the call, with no hang, when the worker cannot start", async () => {
    const cli = workerCli({ wasmPath: MISSING_WASM })
    await expect(cli.didToContract(icrc1Did)).rejects.toThrow(/did not start/)
  })
})

describe("the loader over the worker", () => {
  it("reports a compile stopped at its deadline as a timeout, remembered briefly", async () => {
    let time = 1_000_000
    const source = sourceOf(HOSTILE_DID)
    const loader = createInterfaceLoader({
      source,
      cli: workerCli({ deadlineMs: 300 }),
      now: () => time,
    })
    expect(await loader.load(CKBTC_LEDGER)).toMatchObject({
      ok: false,
      code: "timeout",
    })
    time += TRANSIENT_FAILURE_TTL_MS - 1
    await loader.load(CKBTC_LEDGER)
    expect(source.reads).toBe(1)
  })

  it("lets its own timeout fire while the worker compiles", async () => {
    const cli = workerCli({ deadlineMs: 10_000 })
    await cli.didToContract("service : {}")
    const loader = createInterfaceLoader({
      source: sourceOf(HOSTILE_DID),
      cli,
      timeoutMs: 200,
    })
    const started = performance.now()
    const [result, ticks] = await ticksDuring(() => loader.load(CKBTC_LEDGER))
    expect(result).toMatchObject({ ok: false, code: "timeout" })
    expect(performance.now() - started).toBeLessThan(1_500)
    expect(ticks).toBeGreaterThan(5)
  })

  it("reports a compiler that cannot start as compile_failed, remembered briefly", async () => {
    let time = 1_000_000
    const source = sourceOf(icrc1Did)
    const loader = createInterfaceLoader({
      source,
      cli: workerCli({ wasmPath: MISSING_WASM }),
      now: () => time,
    })
    expect(await loader.load(CKBTC_LEDGER)).toMatchObject({
      ok: false,
      code: "compile_failed",
      message: expect.stringMatching(
        /^The compiler could not run: The compiler worker did not start: .*ENOENT/
      ),
    })
    time += TRANSIENT_FAILURE_TTL_MS - 1
    await loader.load(CKBTC_LEDGER)
    expect(source.reads).toBe(1)
    time += 1
    await loader.load(CKBTC_LEDGER)
    expect(source.reads).toBe(2)
  })

  it("stops its own worker on close, failing the compile it ran", async () => {
    const loader = createInterfaceLoader({ source: sourceOf(HOSTILE_DID) })
    const pending = loader.load(CKBTC_LEDGER)
    // Let the read land and the compile start.
    await new Promise((resolve) => setTimeout(resolve, 100))
    await loader.close()
    expect(await pending).toMatchObject({
      ok: false,
      code: "compile_failed",
      message: expect.stringMatching(/closed/),
    })
  })

  it("leaves a compiler it was given to its owner", async () => {
    const cli = workerCli()
    const close = vi.spyOn(cli, "close")
    const loader = createInterfaceLoader({ source: sourceOf(icrc1Did), cli })
    expect((await loader.load(CKBTC_LEDGER)).ok).toBe(true)
    await loader.close()
    expect(close).not.toHaveBeenCalled()
  })
})
