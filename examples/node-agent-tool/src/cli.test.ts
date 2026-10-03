// src/cli.ts itself, run by Node the way a person or an agent runs it: the
// arguments, the streams and the exit code. Only commands that need no
// network run here (the others are tested through run() over the in-memory
// replica).
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { SEED_VARIABLE } from "./identity.ts"
import { generatePem } from "./test-kit.ts"

const CLI = fileURLToPath(new URL("./cli.ts", import.meta.url))

function node(argv: readonly string[], env: Record<string, string> = {}) {
  const result = spawnSync(
    process.execPath,
    ["--disable-warning=ExperimentalWarning", CLI, ...argv],
    {
      encoding: "utf8",
      env: { PATH: process.env.PATH ?? "", ...env },
      timeout: 60_000,
    }
  )
  return {
    status: result.status,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  }
}

describe("node src/cli.ts", () => {
  it("--help exits 0 with the usage", () => {
    const result = node(["--help"])
    expect(result.status).toBe(0)
    expect(result.stdout).toMatch(
      /^node-agent-tool: read and send ICRC-1 tokens/
    )
  })

  it("whoami --json signs as the seed in the environment, with no network", () => {
    const key = generatePem("ed25519")
    const result = node(["whoami", "--json"], {
      [SEED_VARIABLE]: Buffer.from(key.seed).toString("hex"),
    })
    expect(result.status).toBe(0)
    expect(result.stderr).toBe("")
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      principal: key.principal,
      status: "signed-in",
    })
  })

  it("exits 2 for an unknown command, with the reason on stderr", () => {
    const result = node(["send", "1"])
    expect(result.status).toBe(2)
    expect(result.stderr).toMatch(/^error: usage: unknown command "send"/)
  })

  it("runs the demo to exit 0", () => {
    const result = node(["demo"])
    expect(result.status).toBe(0)
    expect(result.stdout).toMatch(/demo: all 10 steps ended as expected\.$/)
  })
})
