// The entry point: `node src/cli.ts <command> ...` (Node 22.18 or newer runs
// the TypeScript as is). The only file that touches `process`: it hands the
// arguments, the environment, the streams, the clock, Ctrl-C and the real
// `createClient` to src/run.ts, and exits with the code it returns.
import { readFileSync } from "node:fs"
import { createClient } from "@ic-reactor/core"
import { run } from "./run.ts"

process.exitCode = await run({
  argv: process.argv.slice(2),
  env: process.env,
  io: {
    stdout: (line) => process.stdout.write(`${line}\n`),
    stderr: (line) => process.stderr.write(`${line}\n`),
  },
  connect: createClient,
  now: () => BigInt(Date.now()) * 1_000_000n,
  readFile: (path) => readFileSync(path, "utf8"),
  onInterrupt: (stop) => {
    process.once("SIGINT", stop)
    return () => process.off("SIGINT", stop)
  },
})
