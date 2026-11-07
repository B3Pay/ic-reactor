#!/usr/bin/env node
// The `ic-reactor-mcp` command: an MCP server on stdio.
//
// stdout carries the protocol, so everything for the person goes to stderr,
// which MCP clients keep in their server log.
import { readFileSync, statSync } from "node:fs"
import { createRequire } from "node:module"
import { createClient } from "@ic-reactor/core"
import type { HttpAgent } from "@icp-sdk/core/agent"
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio"
import { callerFrom, type KeyFiles } from "./identity.ts"
import { createInterfaceLoader } from "./interface/loader.ts"
import {
  agentCandidSource,
  createReadAgent,
  type CandidSource,
} from "./interface/read-candid.ts"
import { parseOptions } from "./options.ts"
import { createMcpServer } from "./server/server.ts"
import { USAGE, UsageError } from "./usage.ts"

const VERSION = (
  createRequire(import.meta.url)("../package.json") as { version: string }
).version

const log = (line: string): void => {
  process.stderr.write(`[ic-reactor-mcp] ${line}\n`)
}

const nodeKeyFiles: KeyFiles = {
  mode: (path) =>
    process.platform === "win32" ? undefined : statSync(path).mode,
  read: (path) => readFileSync(path, "utf8"),
}

/**
 * The agent that reads interfaces, made on first use: a local replica that is
 * not up yet when the server starts is tried again on the next read.
 */
function lazySource(make: () => Promise<HttpAgent>): CandidSource {
  let source: Promise<CandidSource> | undefined
  const get = (): Promise<CandidSource> => {
    source ??= make().then(agentCandidSource, (error: unknown) => {
      source = undefined
      throw error
    })
    return source
  }
  return {
    readCandidAndHash: async (id) => (await get()).readCandidAndHash(id),
    readModuleHash: async (id) => (await get()).readModuleHash(id),
    readTmpHack: async (id) => (await get()).readTmpHack(id),
  }
}

async function main(argv: readonly string[]): Promise<void> {
  let options
  let caller
  try {
    options = parseOptions(argv)
    if (options.help) {
      process.stdout.write(USAGE)
      return
    }
    if (options.version) {
      process.stdout.write(`${VERSION}\n`)
      return
    }
    caller = callerFrom(options.identityPath, nodeKeyFiles)
  } catch (error) {
    if (!(error instanceof UsageError)) throw error
    process.stderr.write(`ic-reactor-mcp: ${error.message}\n`)
    process.exitCode = 2
    return
  }

  const { network } = options
  const client = createClient({
    network: network.network,
    identity: caller.identity,
  })
  // Certified reads are replicated calls, so they never carry the key.
  const anonymousClient =
    caller.identity === "anonymous"
      ? client
      : createClient({ network: network.network, identity: "anonymous" })
  const loader = createInterfaceLoader({
    source: lazySource(() => createReadAgent(network.read)),
    files: options.didFiles,
    ...(network.recheckMs === undefined
      ? {}
      : { recheckMs: network.recheckMs }),
  })
  const server = createMcpServer({
    client,
    anonymousClient,
    loader,
    canisters: options.canisters,
    callerSource: caller.source,
    networkLabel: network.label,
    version: VERSION,
    log,
  })

  let closed = false
  const shutdown = async (): Promise<void> => {
    if (closed) return
    closed = true
    await server.close().catch(() => {})
    await loader.close().catch(() => {})
    client.dispose()
    if (anonymousClient !== client) anonymousClient.dispose()
  }
  // The client closing stdin ends the session.
  server.onclose = () => void shutdown()
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void shutdown().finally(() => process.exit(0))
    })
  }

  await server.connect(new StdioServerTransport())
  log(
    `${VERSION} serving on stdio: caller ${client.caller()} (${caller.source}); network ${network.label}; ` +
      (options.canisters.length === 0
        ? "no listed canisters"
        : `canisters ${options.canisters.map((c) => `${c.name}=${c.id}`).join(", ")}`)
  )
}

main(process.argv.slice(2)).catch((error: unknown) => {
  log(error instanceof Error ? (error.stack ?? error.message) : String(error))
  process.exitCode = 1
})
