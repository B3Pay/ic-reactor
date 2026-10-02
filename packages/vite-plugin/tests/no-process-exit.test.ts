/**
 * A Vite plugin runs inside someone else's process, so it never ends that
 * process: it reports a failure by throwing or logging, and Vite decides what
 * to do. This reads the plugin's source and fails on any way of writing
 * `process.exit`.
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src")

/**
 * The ways source ends or aborts the process: `process.exit(`,
 * `process["exit"](`, `process.abort(`, `process.kill(process.pid` and an
 * import of `exit` from `node:process`.
 */
function endsTheProcess(source: string): boolean {
  return [
    /\bprocess\s*(\.|\?\.|\[\s*["'`])\s*(exit|abort|reallyExit)\b/,
    /\bprocess\s*\.\s*kill\s*\(\s*process\s*\.\s*pid\b/,
    /\bimport\s*\{[^}]*\b(exit|abort)\b[^}]*\}\s*from\s*["'](node:)?process["']/,
  ].some((pattern) => pattern.test(source))
}

/** The files the package ships: its source, not its tests (see `files` in package.json). */
function shippedSource(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) return shippedSource(file)
    return /\.[cm]?[jt]sx?$/.test(entry.name) &&
      !/\.test\.[cm]?[jt]sx?$/.test(entry.name)
      ? [file]
      : []
  })
}

describe("the plugin's source", () => {
  it("scans the files that make up the plugin", () => {
    const names = shippedSource(SRC).map((file) => path.basename(file))
    expect(names).toEqual(
      expect.arrayContaining([
        "index.ts",
        "generate.ts",
        "env.ts",
        "dev-environment.ts",
      ])
    )
  })

  it("never calls process.exit", () => {
    const offenders = shippedSource(SRC).filter((file) =>
      endsTheProcess(fs.readFileSync(file, "utf-8"))
    )

    expect(offenders.map((file) => path.relative(SRC, file))).toEqual([])
  })

  it("recognises each spelling it is meant to refuse", () => {
    for (const source of [
      "process.exit(1)",
      "process . exit ( 0 )",
      'process["exit"](1)',
      "process?.exit(1)",
      "process.abort()",
      "process.kill(process.pid, 'SIGKILL')",
      'import { exit } from "node:process"',
      "import { env, exit as quit } from 'process'",
    ]) {
      expect(endsTheProcess(source), source).toBe(true)
    }
    for (const source of [
      "process.exitCode = 1",
      "const { exitCode } = run",
      "child.kill('SIGKILL')",
      "process.env.DEBUG",
      "// the CLI exits with code 1",
    ]) {
      expect(endsTheProcess(source), source).toBe(false)
    }
  })
})
