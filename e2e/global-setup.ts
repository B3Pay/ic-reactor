/**
 * Runs once before the suite, in the vitest process. It asks the `icp` CLI on
 * PATH (the 1.2.0 this package installs, under `pnpm exec`) where the local
 * network is and which id `hello_actor` was deployed with, and hands both to
 * the test files through `inject("replica")`.
 */
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import type { TestProject } from "vitest/node"

export interface Replica {
  /** The replica's API URL, without the trailing slash: `http://127.0.0.1:8000`. */
  readonly host: string
  /** The replica's root key as hex, as `icp network status` reports it. */
  readonly rootKey: string
  /** The id `icp deploy` gave `hello_actor`. */
  readonly canisterId: string
}

declare module "vitest" {
  export interface ProvidedContext {
    replica: Replica
  }
}

const cwd = fileURLToPath(new URL(".", import.meta.url))

const icp = (...args: string[]): string => {
  try {
    return execFileSync("icp", args, {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim()
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr?.trim()
    throw new Error(
      `\`icp ${args.join(" ")}\` failed${stderr ? `: ${stderr}` : ""}. ` +
        "The e2e suite needs a local network with hello_actor deployed: run `bash test.sh` in e2e/.",
      { cause: error }
    )
  }
}

export default function setup(project: TestProject): void {
  const status = JSON.parse(icp("network", "status", "-e", "local", "--json"))
  const host = String(status.api_url).replace(/\/+$/, "")
  const rootKey = String(status.root_key)
  const canisterId = icp(
    "canister",
    "status",
    "hello_actor",
    "-e",
    "local",
    "-i"
  )
  project.provide("replica", { host, rootKey, canisterId })
}
