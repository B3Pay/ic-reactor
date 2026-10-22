/**
 * Tests of the helpers the two floor scripts share.
 *
 * Run by `pnpm test:scripts`.
 */
import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, describe, it } from "node:test"
import { readJson, run, writeJson } from "./io.mjs"

const dir = mkdtempSync(join(tmpdir(), "scripts-io-test-"))
after(() => rmSync(dir, { recursive: true, force: true }))

describe("readJson and writeJson", () => {
  it("write two-space JSON with a final newline, and read it back", () => {
    const file = join(dir, "package.json")
    writeJson(file, { name: "x", private: true })
    assert.equal(
      readFileSync(file, "utf8"),
      '{\n  "name": "x",\n  "private": true\n}\n'
    )
    assert.deepEqual(readJson(file), { name: "x", private: true })
  })
})

describe("run", () => {
  it("says whether the command exited 0, run in cwd with HUSKY=0", () => {
    const where = JSON.stringify(realpathSync(dir))
    const check = (code) =>
      `const { realpathSync } = require("node:fs")
      if (realpathSync(process.cwd()) !== ${where} || process.env.HUSKY !== "0") process.exit(3)
      process.exit(${code})`
    assert.equal(run(process.execPath, ["-e", check(0)], dir), true)
    assert.equal(run(process.execPath, ["-e", check(1)], dir), false)
  })
})
