// The server's copy of the candid-core compiler, in a worker thread. Server
// only. Each compiler call is one synchronous WASM call: on the server's own
// thread a hostile .did within the size cap held the event loop for 2.5 to
// 5 s, and no timer can interrupt that. In a worker the event loop stays
// free, and a call that outlives its deadline is stopped by terminating the
// worker; the next call starts a fresh one.
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { pathToFileURL } from "node:url"
import { Worker } from "node:worker_threads"
import { CompileDeadlineError, type CandidCli } from "./compile.ts"

/**
 * How long one compiler call may run in the worker. Real interfaces take 1
 * to 30 ms; the hostile .did of `MAX_DID_BYTES` takes 2.5 s.
 */
const COMPILE_DEADLINE_MS = 2_000
/** How long a fresh worker may take to load the compiler (about 40 ms). */
const START_TIMEOUT_MS = 15_000
/** Calls waiting for the worker past this many are refused. */
const MAX_QUEUED = 64

// The worker's script, evaluated: an eval worker needs no file of its own,
// so `vite dev` and the server build run the same code. It uses dynamic
// `import()` alone, which works whether Node evaluates it as CommonJS (the
// default) or as a module (a parent run with `--input-type=module` passes
// that on). The library is imported from the file URL the main thread
// resolved, and its WASM is read from disk here: `init()` without bytes
// reads `../wasm/` next to the library's file, which a bundled copy no
// longer has.
const WORKER_SOURCE = `
Promise.all([import("node:worker_threads"), import("node:fs")]).then(
  async ([{ parentPort, workerData }, { readFileSync }]) => {
    const CALLS = new Set(["didToContract", "didToModule", "projectDid", "checkCompatible"])
    const text = (error) => String((error && error.stack) || error)
    try {
      const cli = await import(workerData.cliUrl)
      await cli.init(readFileSync(workerData.wasmPath))
      parentPort.on("message", async ({ id, call, args }) => {
        try {
          if (!CALLS.has(call)) throw new Error("no compiler call " + call)
          parentPort.postMessage({ id, ok: true, value: await cli[call](...args) })
        } catch (error) {
          parentPort.postMessage({ id, ok: false, message: text(error) })
        }
      })
      parentPort.postMessage({ ready: true })
    } catch (error) {
      parentPort.postMessage({ startFailed: text(error) })
    }
  }
)
`

type Call = keyof CandidCli

type Job = {
  id: number
  call: Call
  args: unknown[]
  resolve(value: unknown): void
  reject(error: unknown): void
  timer?: ReturnType<typeof setTimeout>
}

type Reply =
  | { ready: true }
  | { startFailed: string }
  | { id: number; ok: true; value: unknown }
  | { id: number; ok: false; message: string }

export interface WorkerCli extends CandidCli {
  /** Stops the worker; a later call starts another. */
  close(): Promise<void>
}

/**
 * The compiler functions, run one at a time in a worker thread, each
 * stopped at `deadlineMs` with a `CompileDeadlineError`. The worker starts
 * on the first call and is unreferenced, so it never keeps the process
 * alive; a call in flight does, through its deadline timer.
 */
export function createWorkerCli(
  options: { deadlineMs?: number; maxQueued?: number } = {}
): WorkerCli {
  const deadlineMs = options.deadlineMs ?? COMPILE_DEADLINE_MS
  const maxQueued = options.maxQueued ?? MAX_QUEUED
  let worker: Worker | undefined
  let ready = false
  let running: Job | undefined
  const queue: Job[] = []
  let ids = 0

  // One job at a time: the worker has one thread, and a queued job's
  // deadline starts only when the worker takes it.
  function pump(): void {
    if (running !== undefined) return
    const job = queue.shift()
    if (job === undefined) return
    running = job
    if (worker === undefined) {
      try {
        spawn()
      } catch (error) {
        running = undefined
        job.reject(error)
        pump()
      }
    } else if (ready) {
      send(worker, job)
    }
  }

  function spawn(): void {
    const w = new Worker(WORKER_SOURCE, {
      eval: true,
      workerData: locateCompiler(),
    })
    worker = w
    ready = false
    const startTimer = setTimeout(
      () =>
        retire(
          w,
          new Error(
            `The compiler worker did not start within ${START_TIMEOUT_MS / 1000} s.`
          )
        ),
      START_TIMEOUT_MS
    )
    w.on("message", (reply: Reply) => {
      if (worker !== w) return
      if ("ready" in reply) {
        clearTimeout(startTimer)
        ready = true
        if (running !== undefined) send(w, running)
        return
      }
      if ("startFailed" in reply) {
        clearTimeout(startTimer)
        retire(
          w,
          new Error(`The compiler worker did not start: ${reply.startFailed}`)
        )
        return
      }
      const job = running
      if (job === undefined || job.id !== reply.id) return
      clearTimeout(job.timer)
      running = undefined
      if (reply.ok) {
        job.resolve(reply.value)
        pump()
      } else {
        job.reject(new Error(reply.message))
        // The library throws for no data error, so this is a trap of the
        // WASM, which may leave its instance broken: start afresh.
        retire(w)
      }
    })
    w.on("error", (error) => {
      clearTimeout(startTimer)
      retire(w, error)
    })
    w.on("exit", (code) => {
      clearTimeout(startTimer)
      retire(w, new Error(`The compiler worker exited with code ${code}.`))
    })
    // After the listeners: adding a "message" listener refs the port again.
    w.unref()
  }

  function send(w: Worker, job: Job): void {
    job.timer = setTimeout(() => {
      if (running !== job) return
      retire(
        w,
        new CompileDeadlineError(
          `The compile took longer than ${deadlineMs / 1000} s, so the server stopped it.`
        )
      )
    }, deadlineMs)
    w.postMessage({ id: job.id, call: job.call, args: job.args })
  }

  // Stops `w` and fails the job it held; the next job starts a fresh
  // worker. Only the current worker counts: the late "exit" of a worker
  // this terminated must not touch its successor.
  function retire(w: Worker, error?: unknown): void {
    if (worker !== w) return
    worker = undefined
    ready = false
    void w.terminate()
    const job = running
    running = undefined
    if (job !== undefined) {
      clearTimeout(job.timer)
      job.reject(error)
    }
    pump()
  }

  function call<T>(name: Call, args: unknown[]): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (queue.length >= maxQueued) {
        reject(
          new CompileDeadlineError(
            "The server's compiler is busy; try again in a moment.",
            { busy: true }
          )
        )
        return
      }
      queue.push({
        id: ++ids,
        call: name,
        args,
        resolve: (value) => resolve(value as T),
        reject,
      })
      pump()
    })
  }

  return {
    didToContract: (sources) => call("didToContract", [sources]),
    didToModule: (sources) => call("didToModule", [sources]),
    projectDid: (sources, methods) => call("projectDid", [sources, methods]),
    checkCompatible: (written, live) =>
      call("checkCompatible", [written, live]),
    async close() {
      const w = worker
      if (w !== undefined) {
        retire(w, new Error("The compiler worker was closed."))
        await w.terminate()
      }
    },
  }
}

/**
 * Where the worker loads the compiler from: the library as the main thread
 * resolves it, and its WASM (`CANDID_CORE_WASM` names another copy).
 */
function locateCompiler(): { cliUrl: string; wasmPath: string } {
  const require = createRequire(import.meta.url)
  return {
    cliUrl: pathToFileURL(require.resolve("@candid-core/cli")).href,
    wasmPath:
      process.env.CANDID_CORE_WASM ??
      join(
        dirname(require.resolve("@candid-core/cli/package.json")),
        "wasm/candid_core_wasm_bg.wasm"
      ),
  }
}

/** The server's compiler: one worker for every request of the process. */
export const serverCli: WorkerCli = createWorkerCli()

// `vite dev` re-runs this module on an edit: stop the worker it replaces.
import.meta.hot?.dispose(() => serverCli.close())
