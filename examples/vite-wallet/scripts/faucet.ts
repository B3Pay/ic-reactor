// `pnpm faucet <principal> [amount]`: sends local ICP (10 unless told) to a
// principal, such as a dev account the wallet shows, so it has something to
// send. Run it from this directory, with the local network up
// (`pnpm icp:start`).
//
// It runs `icp token transfer` as icp-cli's anonymous identity, the default
// identity of a fresh icp-cli, which every local network funds with ICP when
// it starts; whatever identity is your default, it is left alone. The icp-cli
// of this example's devDependencies (1.2.0) runs it, not one on your PATH.
import { execFileSync } from "node:child_process"
import { createRequire } from "node:module"
import { readFaucetArgs } from "./faucet-args.ts"

const request = readFaucetArgs(process.argv.slice(2))
if (!request.ok) {
  console.error(request.reason)
  process.exit(1)
}

const icp = createRequire(import.meta.url).resolve(
  "@icp-sdk/icp-cli/bin/icp.js"
)
const args = [
  "token",
  "transfer",
  request.amount,
  request.to,
  "--identity",
  "anonymous",
  "--environment",
  "local",
]
console.log(`icp ${args.join(" ")}`)
try {
  execFileSync(process.execPath, [icp, ...args], { stdio: "inherit" })
} catch {
  console.error(
    "The transfer failed. Is the local network running (pnpm icp:start)?"
  )
  process.exit(1)
}
