// @vitest-environment node
// The server's compiler in its worker thread, over the real WASM (offline):
// the deadline that stops a hostile .did, the event loop it keeps free, and
// a worker that cannot start.
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { afterEach, describe, expect, it, vi } from "vitest"
import icrc1Did from "../../did/icrc1.did?raw"
import {
  CompileDeadlineError,
  compileInterface,
  MAX_DID_BYTES,
  utf8Length,
} from "./compile.ts"
import { createWorkerCli, type WorkerCli } from "./compile.server.ts"
import {
  createLiveInterfaceLoader,
  TRANSIENT_FAILURE_TTL_MS,
} from "./live-loader.ts"
import type { CandidSource } from "./read-candid.ts"

const CKBTC_LEDGER = "mxzaz-hqaaa-aaaar-qaada-cai"
const HASH = new Uint8Array(32).fill(0xa1)

// The slowest shape found within the cap: 19,516 methods `m<i> : () -> ()`,
// 262,134 bytes, which the compiler takes 2.5 s over (5 s with the docs).
const HOSTILE_DID = `service : {\n/// d\n${Array.from(
  { length: 19_516 },
  (_, i) => `m${i}:()->();`
).join("")}\n}`

const opened: WorkerCli[] = []

function workerCli(options?: Parameters<typeof createWorkerCli>[0]) {
  const cli = createWorkerCli(options)
  opened.push(cli)
  return cli
}

afterEach(async () => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
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

  it("never keeps a process alive once its calls are done (pnpm smoke)", async () => {
    const module = new URL("./compile.server.ts", import.meta.url).href
    const script = `
      const { createWorkerCli } = await import(${JSON.stringify(module)})
      const reply = await createWorkerCli().didToContract("service : {}")
      console.log("contract" in reply)
    `
    const { stdout } = await promisify(execFile)(
      process.execPath,
      ["--no-warnings", "--input-type=module", "--eval", script],
      { timeout: 10_000 }
    )
    expect(stdout.trim()).toBe("true")
  })

  it("fails the call, with no hang, when the worker cannot start", async () => {
    vi.stubEnv("CANDID_CORE_WASM", "/srv/deploy/releases/missing/candid.wasm")
    const cli = workerCli()
    await expect(cli.didToContract(icrc1Did)).rejects.toThrow(/did not start/)
  })
})

describe("the live loader over the worker", () => {
  it("reports a compile stopped at its deadline as a timeout, remembered briefly", async () => {
    let time = 1_000_000
    const source = sourceOf(HOSTILE_DID)
    const cli = workerCli({ deadlineMs: 300 })
    const loader = createLiveInterfaceLoader({
      source,
      compile: (did) => compileInterface(cli, did),
      compiledIn: "server",
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
    const loader = createLiveInterfaceLoader({
      source: sourceOf(HOSTILE_DID),
      compile: (did) => compileInterface(cli, did),
      compiledIn: "server",
      timeoutMs: 200,
    })
    const started = performance.now()
    const [payload, ticks] = await ticksDuring(() => loader.load(CKBTC_LEDGER))
    expect(payload).toMatchObject({ ok: false, code: "timeout" })
    expect(performance.now() - started).toBeLessThan(1_500)
    expect(ticks).toBeGreaterThan(5)
  })

  it("keeps a compiler that cannot start out of the page: server_error, no path", async () => {
    vi.stubEnv("CANDID_CORE_WASM", "/srv/deploy/releases/missing/candid.wasm")
    const logged = vi.spyOn(console, "error").mockImplementation(() => {})
    const cli = workerCli()
    const loader = createLiveInterfaceLoader({
      source: sourceOf(icrc1Did),
      compile: (did) => compileInterface(cli, did),
      compiledIn: "server",
    })
    const payload = await loader.load(CKBTC_LEDGER)
    expect(payload).toMatchObject({ ok: false, code: "server_error" })
    expect(JSON.stringify(payload)).not.toContain("/srv/")
    expect(String(logged.mock.calls[0]?.[1])).toContain("/srv/")
  })
})
