/**
 * Create Command
 *
 * `ic-reactor create start <app-name>` — a convenience alias for
 * `pnpm create ic-reactor-start <app-name>`. Writes the default V0 app layout
 * to `./<app-name>` (or the given target dir) and prints next steps.
 *
 * V0 generates a CSR/static app: React + TanStack Router + IC Reactor + a
 * Motoko backend, wired for `icp-cli`. It does not run installs or deploys.
 */

import path from "node:path"
import pc from "picocolors"
import { createApp, isValidAppName } from "@ic-reactor/start/scaffold"

export interface CreateStartOptions {
  force?: boolean
}

export function createStartCommand(
  appName: string | undefined,
  target: string | undefined,
  options: CreateStartOptions
): void {
  if (!appName) {
    console.error(
      pc.red(
        "\n✖ Missing app name. Usage: ic-reactor create start <app-name> [target-dir]\n"
      )
    )
    process.exit(1)
  }

  if (!isValidAppName(appName)) {
    console.error(
      pc.red(
        `\n✖ Invalid app name "${appName}". Use lowercase letters, digits, and dashes (e.g. "my-app").\n`
      )
    )
    process.exit(1)
  }

  const targetDir = path.resolve(process.cwd(), target ?? appName)

  try {
    const result = createApp({
      targetDir,
      appName,
      force: options.force ?? false,
    })

    console.log(
      pc.green(
        `\n✔ Created ${result.appName} in ${result.targetDir} (${result.writtenFiles.length} files).\n`
      )
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
      pc.dim(
        "Canister IDs resolve at runtime via icp-cli + the ic_env cookie — no .env file needed."
      )
    )
  } catch (err) {
    console.error(pc.red(`\n✖ ${(err as Error).message}\n`))
    process.exit(1)
  }
}
