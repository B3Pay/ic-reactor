/**
 * An `icp` that never exits is killed at the timeout together with the
 * process it started. npm's `icp` is a Node script that starts the native
 * binary as its child, on the script's own pipes, and killing the script alone
 * left that child running: while detection is incomplete, each page load could
 * leave one more (#980). Not on Windows, where the plugin runs `icp.exe`
 * itself.
 */
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { runIcp } from "../src/env.js"

/** A stand-in for npm's `icp`: it starts a child as the script does, and hangs. */
const HANGING_ICP = `#!/usr/bin/env node
const { spawn } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")
const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
  stdio: "inherit",
})
fs.writeFileSync(path.join(__dirname, "child.pid"), String(child.pid))
setInterval(() => {}, 1000)
`

const dirs: string[] = []
const pids: number[] = []

afterEach(() => {
  vi.unstubAllEnvs()
  for (const pid of pids.splice(0)) {
    try {
      process.kill(pid, "SIGKILL")
    } catch {
      // Gone already.
    }
  }
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true })
})

/**
 * Whether `pid` is a process still running: one that exited but was not
 * reaped yet (a zombie, which `kill(pid, 0)` still finds) is not.
 */
function running(pid: number): boolean {
  try {
    process.kill(pid, 0)
  } catch {
    return false
  }
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf-8")
    return stat.slice(stat.lastIndexOf(")") + 2)[0] !== "Z"
  } catch {
    return true
  }
}

describe.skipIf(process.platform === "win32")("an icp that never exits", () => {
  it("is killed at the timeout with the process it started", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ic-reactor-icp-"))
    dirs.push(dir)
    fs.writeFileSync(path.join(dir, "icp"), HANGING_ICP, { mode: 0o755 })
    vi.stubEnv("PATH", `${dir}${path.delimiter}${process.env.PATH}`)
    const childPid = path.join(dir, "child.pid")

    const failure = await runIcp(["network", "status"], dir, 1000).catch(
      (error: unknown) => error
    )

    expect(failure).toMatchObject({ killed: true, signal: "SIGTERM" })
    expect((failure as Error).message).toBe(
      "Command failed: icp network status\n"
    )
    const pid = Number(fs.readFileSync(childPid, "utf-8"))
    pids.push(pid)
    await vi.waitFor(() => expect(running(pid)).toBe(false), {
      timeout: 2000,
    })
  })
})
