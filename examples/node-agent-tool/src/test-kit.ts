// The tests run the CLI the way src/cli.ts runs it in a terminal, through
// `run()`, with one difference: `connect` builds a client from
// `createTestClient()` (@ic-reactor/core/testing) instead of `createClient`,
// so every call goes to an in-memory replica. No test reaches a network.
//
// `connect` honours the options the CLI chose: an Identity is signed in on
// the test client (the replica checks its signatures), "anonymous" leaves it
// signed out (the client refuses writes), and the network names the host the
// replica answers on. The mock ledger's accounts outlive each run's client, so
// one test can transfer, then re-send, then read the balance.
import { generateKeyPairSync } from "node:crypto"
import type { ClientOptions } from "@ic-reactor/core"
import { createTestClient } from "@ic-reactor/core/testing"
import { Principal } from "@icp-sdk/core/principal"
import { principal, type Principal as Text } from "@candid-core/schema"
import { LEDGERS } from "./ledgers.ts"
import { createMockLedger, type MockLedgerOptions } from "./mock-ledger.ts"
import { run } from "./run.ts"

export type TestClient = ReturnType<typeof createTestClient>

/** A fixed clock: 2026-10-01T00:00:00Z, in nanoseconds. */
export const NOW = 1_790_812_800_000_000_000n

/** A JSON document the CLI printed. */
export type Doc = { readonly [field: string]: unknown }

export interface CliRun {
  readonly exitCode: number
  readonly stdout: readonly string[]
  readonly stderr: readonly string[]
  /** stdout read as JSON, a document per line (a --json run). */
  readonly docs: readonly Doc[]
  /** The options the CLI built its client with; `undefined` if it built none. */
  readonly options: ClientOptions | undefined
  /** The test client of this run, if one was built. */
  readonly test: TestClient | undefined
  /** The query and call requests the replica received in this run. */
  readonly requests: TestClient["requests"]
}

export interface RunOptions {
  readonly env?: Readonly<Record<string, string>>
  /** Runs on the run's test client before the command does, to arm a failure. */
  readonly before?: (test: TestClient) => void
}

/**
 * A mock ledger and a way to run the CLI against it.
 *
 * @param files - What `--pem <path>` reads, by path: tests never touch the disk.
 */
export function createCli(
  options: {
    readonly ledger?: Partial<MockLedgerOptions>
    readonly files?: Readonly<Record<string, string>>
  } = {}
) {
  const ledger = createMockLedger({
    id: LEDGERS.icp,
    now: () => NOW,
    ...options.ledger,
  })
  const files = options.files ?? {}
  const interrupts = new Set<() => void>()

  /** Starts a run; `stdout` and `stderr` fill while it runs. */
  function start(argv: readonly string[], runOptions: RunOptions = {}) {
    const stdout: string[] = []
    const stderr: string[] = []
    let clientOptions: ClientOptions | undefined
    let test: TestClient | undefined
    const finished = run({
      argv,
      env: runOptions.env ?? {},
      io: {
        stdout: (line) => stdout.push(...line.split("\n")),
        stderr: (line) => stderr.push(...line.split("\n")),
      },
      connect(chosen) {
        clientOptions = chosen
        const identity = chosen.identity
        test = createTestClient({
          ...(identity === undefined || identity === "anonymous"
            ? { signedIn: false }
            : { identity }),
          network: chosen.network,
        })
        ledger.mountOn(test)
        runOptions.before?.(test)
        return test.client
      },
      now: () => NOW,
      readFile(path) {
        const text = files[path]
        if (text === undefined) {
          throw new Error(`ENOENT: no such file or directory, open '${path}'`)
        }
        return text
      },
      onInterrupt(stop) {
        interrupts.add(stop)
        return () => interrupts.delete(stop)
      },
    }).then((exitCode): CliRun => ({
      exitCode,
      stdout,
      stderr,
      docs: stdout.filter((line) => line.startsWith("{")).map(parseDoc),
      options: clientOptions,
      test,
      requests: (test?.requests ?? []).filter(
        (r) => r.endpoint === "query" || r.endpoint === "call"
      ),
    }))
    return { stdout, stderr, finished, test: () => test }
  }

  return {
    ledger,
    start,
    /** Runs the CLI to the end. */
    cli: (argv: readonly string[], runOptions?: RunOptions) =>
      start(argv, runOptions).finished,
    /** Ctrl-C. */
    interrupt: () => {
      for (const stop of [...interrupts]) stop()
    },
  }
}

function parseDoc(line: string): Doc {
  const value: unknown = JSON.parse(line)
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`not a JSON object: ${line}`)
  }
  return value as Doc
}

// ---------------------------------------------------------------------------
// Keys made for the tests: never a real one.
// ---------------------------------------------------------------------------

/** A new key as PEM text, and its principal worked out from the public key alone. */
export function generatePem(algorithm: "ed25519" | "secp256k1"): {
  readonly pem: string
  readonly principal: Text
  readonly seed: Uint8Array
} {
  const { privateKey, publicKey } =
    algorithm === "ed25519"
      ? generateKeyPairSync("ed25519")
      : generateKeyPairSync("ec", { namedCurve: "secp256k1" })
  // The IC's self-authenticating principal is a hash of the DER public key.
  const der = new Uint8Array(publicKey.export({ format: "der", type: "spki" }))
  const jwk = privateKey.export({ format: "jwk" })
  return {
    pem: privateKey
      .export({
        format: "pem",
        type: algorithm === "ed25519" ? "pkcs8" : "sec1",
      })
      .toString(),
    principal: principal(Principal.selfAuthenticating(der).toText()),
    seed: new Uint8Array(Buffer.from(jwk.d ?? "", "base64url")),
  }
}
