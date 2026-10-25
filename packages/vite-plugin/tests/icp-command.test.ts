/**
 * How the plugin starts `icp`. On Windows, npm links icp-cli's npm package as
 * `node_modules/.bin/icp.cmd`, which `spawn` cannot start, so the package's
 * bin script is run with Node there.
 */
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { afterEach, describe, expect, it } from "vitest"
import { icpCommand, installIcpAdvice } from "../src/env.js"
import { removeDirectory } from "./support.js"

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) removeDirectory(root)
})

/** An app root, with `@icp-sdk/icp-cli` installed when `bin` is given. */
function app(bin?: string | Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "icp-command-"))
  roots.push(root)
  fs.writeFileSync(path.join(root, "package.json"), '{"name":"app"}')
  if (bin !== undefined) install(path.join(root, "node_modules"), bin)
  return root
}

/**
 * `@icp-sdk/icp-cli` in `nodeModules`, whose bin script prints its arguments,
 * as the real one would print what `icp` answers.
 */
function install(nodeModules: string, bin: string | Record<string, string>) {
  const dir = path.join(nodeModules, "@icp-sdk", "icp-cli")
  fs.mkdirSync(path.join(dir, "bin"), { recursive: true })
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "@icp-sdk/icp-cli", version: "1.2.0", bin })
  )
  fs.writeFileSync(
    path.join(dir, "bin", "icp.js"),
    "process.stdout.write(JSON.stringify(process.argv.slice(2)))\n"
  )
}

/** icp-cli's platform package for this machine in `nodeModules`, with its icp.exe. */
function nativeIcp(nodeModules: string): string {
  fs.mkdirSync(nodeModules, { recursive: true })
  const dir = path.join(
    fs.realpathSync(nodeModules),
    "@icp-sdk",
    `icp-cli-win32-${process.arch}`,
    "bin"
  )
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, "icp.exe"), "")
  return path.join(dir, "icp.exe")
}

/** A stand-in for `%APPDATA%`, with npm's global prefix in it. */
function appData(withIcp: boolean): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "icp-appdata-"))
  roots.push(root)
  if (withIcp)
    install(path.join(root, "npm", "node_modules"), { icp: "bin/icp.js" })
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

  it("starts the bin script it names, so the command runs as given", () => {
    // What spawn is handed on Windows, run here on any platform: Node and
    // the script, never a .cmd shim.
    const { file, args } = icpCommand(app({ icp: "bin/icp.js" }), "win32")
    const out = execFileSync(file, [...args, "network", "status", "--json"], {
      encoding: "utf-8",
    })
    expect(JSON.parse(out)).toEqual(["network", "status", "--json"])
  })

  it("runs a global npm install's bin script on Windows when the app has none", () => {
    const data = appData(true)
    expect(icpCommand(app(), "win32", data)).toEqual({
      file: process.execPath,
      args: [
        path.join(
          fs.realpathSync(path.join(data, "npm", "node_modules")),
          "@icp-sdk",
          "icp-cli",
          "bin",
          "icp.js"
        ),
      ],
    })
  })

  it("prefers the app's own icp-cli to a global one", () => {
    const root = app({ icp: "bin/icp.js" })
    expect(icpCommand(root, "win32", appData(true)).args[0]).toContain(
      fs.realpathSync(root)
    )
  })

  it("runs the icp.exe the bin script would start, so a timeout kills icp itself", () => {
    // Beside icp-cli, as a flat or global install puts it. Killing the bin
    // script on a timeout would leave this child holding the output pipes.
    const root = app({ icp: "bin/icp.js" })
    const exe = nativeIcp(path.join(root, "node_modules"))
    expect(icpCommand(root, "win32")).toEqual({
      file: exe,
      args: [],
      env: { ICP_CLI_DIST: "npm" },
    })
    // And a global npm install's.
    const data = appData(true)
    const globalExe = nativeIcp(path.join(data, "npm", "node_modules"))
    expect(icpCommand(app(), "win32", data).file).toBe(globalExe)
  })

  it("finds the icp.exe inside icp-cli's own node_modules as well", () => {
    const root = app({ icp: "bin/icp.js" })
    const exe = nativeIcp(
      path.join(root, "node_modules", "@icp-sdk", "icp-cli", "node_modules")
    )
    expect(icpCommand(root, "win32").file).toBe(exe)
  })

  it("looks icp up on PATH on Windows when neither the app nor npm's prefix has icp-cli", () => {
    expect(icpCommand(app(), "win32", appData(false))).toEqual({
      file: "icp",
      args: [],
    })
    expect(icpCommand(app(), "win32", undefined)).toEqual({
      file: "icp",
      args: [],
    })
  })

  it("looks icp up on PATH elsewhere, installed package or not", () => {
    const root = app({ icp: "bin/icp.js" })
    expect(icpCommand(root, "linux")).toEqual({ file: "icp", args: [] })
    expect(icpCommand(root, "darwin")).toEqual({ file: "icp", args: [] })
  })
})

describe("installIcpAdvice", () => {
  it("says an install is enough on Windows, and PATH elsewhere", () => {
    expect(installIcpAdvice("win32")).toMatch(
      /npm install --save-dev @icp-sdk\/icp-cli\) or globally with npm/
    )
    for (const platform of ["linux", "darwin"] as const) {
      expect(installIcpAdvice(platform)).toMatch(
        /^Put `icp` on PATH .*run vite from an npm script\.$/
      )
    }
  })
})
