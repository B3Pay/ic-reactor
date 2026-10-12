// The server's copy of the candid-core compiler. Server only: it reads the
// 1.9 MB WASM from disk.
import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import {
  checkCompatible,
  didToContract,
  didToModule,
  init,
  projectDid,
} from "@candid-core/cli"
import type { CandidCli } from "./compile.ts"

let ready: Promise<void> | undefined

/**
 * Initialises the WASM once, from bytes read here: `init()` without bytes
 * reads `../wasm/` next to the library's own file, which is gone once a
 * server build bundles the library. `CANDID_CORE_WASM` names the file for a
 * server shipped without node_modules.
 */
export function ensureCompiler(): Promise<void> {
  ready ??= (async () => {
    const path =
      process.env.CANDID_CORE_WASM ??
      join(
        dirname(
          createRequire(import.meta.url).resolve(
            "@candid-core/cli/package.json"
          )
        ),
        "wasm/candid_core_wasm_bg.wasm"
      )
    await init(await readFile(path))
  })().catch((error: unknown) => {
    // Note: the library caches a rejected init() itself, so bad bytes need
    // a restart; clearing ours at least retries a file that was missing.
    ready = undefined
    throw error
  })
  return ready
}

// One compile at a time: each is a synchronous WASM call that holds the
// event loop, so concurrent requests queue here instead of piling up.
let queue: Promise<unknown> = Promise.resolve()

function serialized<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>
): (...args: A) => Promise<R> {
  return (...args) => {
    const run = queue.then(async () => {
      await ensureCompiler()
      return fn(...args)
    })
    queue = run.catch(() => undefined)
    return run
  }
}

/** The compiler functions, initialised and run one at a time. */
export const serverCli: CandidCli = {
  didToContract: serialized(didToContract),
  didToModule: serialized(didToModule),
  projectDid: serialized(projectDid),
  checkCompatible: serialized(checkCompatible),
}
