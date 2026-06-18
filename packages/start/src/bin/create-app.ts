#!/usr/bin/env node
/**
 * `create-ic-reactor-start` bin
 *
 * Usage:
 *   pnpm create ic-reactor-start my-app
 *   npx create-ic-reactor-start my-app
 *   create-ic-reactor-start my-app
 *
 * Also reachable as `ic-reactor create start my-app`.
 *
 * V0 writes the default CSR/static app layout, then prints next steps. It does
 * not run `pnpm install` or `icp deploy` itself — the user drives those so the
 * flow stays transparent and auditable.
 */

import path from "node:path"
import { createApp, isValidAppName } from "../scaffold/index.js"

interface ParsedArgs {
  appName: string | undefined
  targetDir: string | undefined
  force: boolean
  help: boolean
}

function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = []
  let force = false
  let help = false

  for (const arg of argv) {
    if (arg === "-h" || arg === "--help") help = true
    else if (arg === "--force") force = true
    else positional.push(arg)
  }

  return {
    appName: positional[0],
    targetDir: positional[1],
    force,
    help,
  }
}

const HELP = `
create-ic-reactor-start — scaffold a fully on-chain ICP React app.

Usage:
  pnpm create ic-reactor-start <app-name> [options]
  create-ic-reactor-start <app-name> [target-dir] [options]

Arguments:
  app-name       Package name of the new app (lowercase, dashes, digits).
  target-dir     Optional. Defaults to ./<app-name>.

Options:
  --force        Write into a non-empty target directory.
  -h, --help     Show this help.

The scaffold writes a CSR/static V0 app (React + TanStack Router + IC Reactor
+ Motoko backend) configured for icp-cli. It does not install dependencies.

Next steps after creating:
  cd <app-name>
  pnpm install
  icp network start -d
  icp deploy
  pnpm dev
`.trim()

function fail(message: string, code = 1): never {
  console.error(`\n✖ ${message}\n`)
  process.exit(code)
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  if (args.help) {
    console.log(HELP)
    process.exit(0)
  }

  if (!args.appName) {
    console.log(HELP)
    fail("Missing <app-name>.")
  }

  const appName = args.appName as string
  if (!isValidAppName(appName)) {
    fail(
      `Invalid app name "${appName}". Use lowercase letters, digits, and dashes (e.g. "my-app").`
    )
  }

  const targetDir = path.resolve(process.cwd(), args.targetDir ?? appName)

  try {
    const result = createApp({ targetDir, appName, force: args.force })
    console.log(
      `\n✔ Created ${result.appName} in ${result.targetDir} ` +
        `(${result.writtenFiles.length} files).\n`
    )
    console.log("Next steps:\n")
    console.log(`  cd ${path.relative(process.cwd(), targetDir) || "."}`)
    console.log("  pnpm install")
    console.log(
      "  icp network start -d   # start local replica + Internet Identity"
    )
    console.log(
      "  icp deploy             # deploy backend + frontend canisters"
    )
    console.log(
      "  pnpm dev               # start Vite (resolves canister IDs via ic_env)\n"
    )
    console.log(
      "Canister IDs resolve at runtime via icp-cli + the ic_env cookie — no .env file needed."
    )
  } catch (err) {
    fail((err as Error).message)
  }
}

main()
