/**
 * Tests of the peers-included size checks in `scripts/size-app/`: that they
 * measure what they say, and that `pnpm size` and CI run them.
 *
 * size-limit adds every `peerDependencies` entry of the package it runs in to
 * each check's `ignore`. A peer added to the fixture would drop that peer from
 * both checks without failing either, so the first test guards it.
 *
 * Run by `pnpm test:scripts`.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..")
const fixtureDir = join(repoRoot, "scripts", "size-app")
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"))

describe("the size-app fixture", () => {
  it("declares no peers, so size-limit ignores none of them", () => {
    const manifest = readJson(join(fixtureDir, "package.json"))
    assert.equal(manifest.private, true)
    assert.deepEqual(manifest.peerDependencies ?? {}, {})
    assert.deepEqual(manifest.peerDependenciesMeta ?? {}, {})
  })

  it("measures { createClient } with core's peers, ignoring nothing", async () => {
    const { default: checks } = await import(
      pathToFileURL(join(fixtureDir, ".size-limit.js")).href
    )
    const core = checks.find((check) => check.path === "core.js")
    assert.ok(core, "no check of core.js")
    assert.ok(core.limit, "the core.js check has no limit")
    assert.deepEqual(core.ignore ?? [], [])
    assert.match(
      readFileSync(join(fixtureDir, "core.js"), "utf8"),
      /^export \{ createClient \} from "@ic-reactor\/core"$/m
    )
  })

  it("leaves only React itself out of the React path", async () => {
    const { default: checks } = await import(
      pathToFileURL(join(fixtureDir, ".size-limit.js")).href
    )
    const react = checks.find((check) => check.path === "react.js")
    assert.ok(react, "no check of react.js")
    assert.ok(react.limit, "the react.js check has no limit")
    assert.deepEqual(react.ignore, ["react", "react/jsx-runtime"])
  })

  it("runs in `pnpm size`, which CI's build job runs after the build", () => {
    const { scripts } = readJson(join(repoRoot, "package.json"))
    assert.match(scripts.size, /--filter \.\/scripts\/size-app\b/)
    const ci = readFileSync(
      join(repoRoot, ".github", "workflows", "ci.yml"),
      "utf8"
    )
    const build = ci.indexOf("run: pnpm build\n")
    const size = ci.indexOf("run: pnpm size\n")
    assert.ok(
      build !== -1 && size > build,
      "ci.yml runs no `pnpm size` after `pnpm build`"
    )
  })
})
