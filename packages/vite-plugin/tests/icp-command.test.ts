/**
 * How the plugin starts `icp`. On Windows, npm links icp-cli's npm package as
 * `node_modules/.bin/icp.cmd`, which `execFile` cannot start, so the package's
 * bin script is run with Node there.
 */
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { icpCommand } from "../src/env.js"

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

/** An app root, with `@icp-sdk/icp-cli` installed when `bin` is given. */
function app(bin?: string | Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "icp-command-"))
  roots.push(root)
  fs.writeFileSync(path.join(root, "package.json"), '{"name":"app"}')
  if (bin !== undefined) {
    const dir = path.join(root, "node_modules", "@icp-sdk", "icp-cli")
    fs.mkdirSync(path.join(dir, "bin"), { recursive: true })
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ name: "@icp-sdk/icp-cli", version: "1.2.0", bin })
    )
    fs.writeFileSync(path.join(dir, "bin", "icp.js"), "")
  }
  return root
}

describe("icpCommand", () => {
  it("runs the installed icp-cli's bin script with Node on Windows", () => {
    const root = app({ icp: "bin/icp.js" })
    expect(icpCommand(root, "win32")).toEqual({
      file: process.execPath,
      args: [
        path.join(
          fs.realpathSync(root),
          "node_modules",
          "@icp-sdk",
          "icp-cli",
          "bin",
          "icp.js"
        ),
      ],
    })
  })

  it("finds a package installed above the app, as in a workspace", () => {
    const workspace = app({ icp: "bin/icp.js" })
    const root = path.join(workspace, "packages", "web")
    fs.mkdirSync(root, { recursive: true })
    expect(icpCommand(root, "win32").args).toEqual([
      path.join(
        fs.realpathSync(workspace),
        "node_modules",
        "@icp-sdk",
        "icp-cli",
        "bin",
        "icp.js"
      ),
    ])
  })

  it("reads a bin given as one string too", () => {
    const root = app("bin/icp.js")
    expect(icpCommand(root, "win32").file).toBe(process.execPath)
  })

  it("looks icp up on PATH on Windows when the app has no icp-cli package", () => {
    expect(icpCommand(app(), "win32")).toEqual({ file: "icp", args: [] })
  })

  it("looks icp up on PATH elsewhere, installed package or not", () => {
    const root = app({ icp: "bin/icp.js" })
    expect(icpCommand(root, "linux")).toEqual({ file: "icp", args: [] })
    expect(icpCommand(root, "darwin")).toEqual({ file: "icp", args: [] })
  })
})
