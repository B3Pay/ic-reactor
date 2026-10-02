/**
 * Tests of the fault verifier, against a small repository of its own: a listed
 * test must fail under its fault, and every way that can go wrong without that
 * being true must be reported.
 *
 * It runs the real vitest, borrowed from `packages/core`'s installs.
 *
 * Run by `pnpm test:scripts`.
 */
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { after, describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import { createWorkspaceCopy } from "./lib/fault-workspace.mjs"
import { loadManifest, verifyFaults } from "./verify-faults.mjs"

const realCore = realpathSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "packages", "core")
)

const SOURCE = `export function add(a: number, b: number): number {
  return a + b
}

export function sub(a: number, b: number): number {
  return a - b
}
`

const TESTS = `import { describe, expect, it } from "vitest"
import { add, sub } from "../src/index.js"

describe("arithmetic", () => {
  it("adds", () => {
    expect(add(1, 2)).toBe(3)
  })
  it("subtracts", () => {
    expect(sub(5, 2)).toBe(3)
  })
  it("adds a negative", () => {
    expect(add(1, -2)).toBe(-1)
  })
})
`

const roots = []

/**
 * A repository with one package, `demo`, holding `SOURCE` and `TESTS`; `files`
 * add to or replace its files. The package's `node_modules` is core's, for
 * vitest.
 */
function repo(files = {}) {
  const root = mkdtempSync(join(tmpdir(), "verify-faults-test-"))
  roots.push(root)
  const all = {
    "tsconfig.base.json": JSON.stringify({ compilerOptions: { strict: true } }),
    "packages/demo/package.json": JSON.stringify({
      name: "demo",
      type: "module",
    }),
    "packages/demo/src/index.ts": SOURCE,
    "packages/demo/tests/arithmetic.test.ts": TESTS,
    ...files,
  }
  for (const [path, text] of Object.entries(all)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  symlinkSync(
    join(realCore, "node_modules"),
    join(root, "packages/demo/node_modules"),
    "dir"
  )
  return root
}
after(() => {
  for (const root of roots) {
    // Unlink core's installs first: a recursive delete must not reach them.
    unlinkSync(join(root, "packages/demo/node_modules"))
    rmSync(root, { recursive: true, force: true })
  }
})

/** Writes a manifest into the repository and returns its path. */
function manifestFor(root, entries) {
  const path = join(root, "faults.json")
  writeFileSync(path, JSON.stringify(entries))
  return path
}

/** A manifest entry for `demo`'s arithmetic tests. */
const entry = (fields) => ({
  id: "an-entry",
  package: "demo",
  test: "tests/arithmetic.test.ts",
  file: "src/index.ts",
  search: "return a + b",
  replace: "return a - b",
  ...fields,
})

const verify = (root, entries, options = {}) =>
  verifyFaults({
    repoRoot: root,
    manifest: manifestFor(root, entries),
    jobs: 4,
    ...options,
  })

const mentions = (result, text) =>
  result.failures.filter((f) => f.includes(text))

/** Every file of `dir` but its installs, with a hash of its content. */
function snapshot(dir) {
  const found = {}
  const walk = (current) => {
    for (const name of readdirSync(current)) {
      if (name === "node_modules") continue
      const path = join(current, name)
      if (statSync(path).isDirectory()) walk(path)
      else
        found[path] = createHash("sha256")
          .update(readFileSync(path))
          .digest("hex")
    }
  }
  walk(dir)
  return found
}

/**
 * What the installs `demo` borrows hold of the tool state a run writes beside
 * them: every file of `.vite` (vitest's cache) and `.vite-temp` (the config it
 * bundles), with its size and time, or null where there is none.
 */
function toolState() {
  const state = {}
  for (const name of [".vite", ".vite-temp"]) {
    const base = join(realCore, "node_modules", name)
    const files = []
    const walk = (current) => {
      for (const entry of readdirSync(current)) {
        const path = join(current, entry)
        const info = statSync(path)
        if (info.isDirectory()) walk(path)
        else files.push(`${path}:${info.size}:${info.mtimeMs}`)
      }
    }
    if (existsSync(base)) walk(base)
    state[name] = existsSync(base) ? files.sort() : null
  }
  return state
}

describe("the workspace copy", () => {
  it("mirrors the installs entry by entry, so a tool's cache lands in the copy", () => {
    const root = repo()
    const copy = createWorkspaceCopy({
      repoRoot: root,
      packageDir: "packages/demo",
    })
    try {
      const installs = join(copy.dir, "node_modules")
      assert.equal(lstatSync(installs).isSymbolicLink(), false)
      assert.equal(lstatSync(join(installs, "vitest")).isSymbolicLink(), true)
      assert.ok(existsSync(join(installs, "vitest", "vitest.mjs")))
      // What a tool writes there stays in the copy.
      mkdirSync(join(installs, ".vite-temp"))
      writeFileSync(join(installs, ".vite-temp", "config.mjs"), "")
      assert.equal(
        existsSync(join(realCore, "node_modules", ".vite-temp", "config.mjs")),
        false
      )
    } finally {
      copy.cleanup()
    }
    // Cleaning up unlinks; it never reaches into what the links point at.
    assert.ok(existsSync(join(realCore, "node_modules", "vitest")))
    assert.equal(existsSync(copy.root), false)
  })

  it("does not link what a tool writes beside the installs", () => {
    const root = repo()
    const copy = createWorkspaceCopy({
      repoRoot: root,
      packageDir: "packages/demo",
    })
    try {
      const names = readdirSync(join(copy.dir, "node_modules"))
      assert.ok(names.includes("vitest"))
      assert.deepEqual(
        names.filter((name) => /^\.(?:vite|vitest|cache)/.test(name)),
        []
      )
    } finally {
      copy.cleanup()
    }
  })
})

describe("verifyFaults", () => {
  it("writes no vitest cache into the installs it borrows", async () => {
    const root = repo()
    const before = toolState()
    const result = await verify(root, [
      entry({ id: "one" }),
      entry({ id: "two", testName: "adds" }),
    ])
    assert.deepEqual(result.failures, [])
    assert.deepEqual(toolState(), before)
  })

  it("passes when each listed test fails under its fault, and leaves the tree as it was", async () => {
    const root = repo()
    const manifest = manifestFor(root, [
      entry({ id: "add-breaks-adds" }),
      entry({
        id: "sub-breaks-subtracts",
        testName: "subtracts",
        search: "return a - b",
        replace: "return a + b",
      }),
    ])
    const before = snapshot(root)
    const result = await verifyFaults({ repoRoot: root, manifest, jobs: 4 })
    assert.deepEqual(result.failures, [])
    assert.deepEqual(result.verified, [
      "add-breaks-adds",
      "sub-breaks-subtracts",
    ])
    assert.deepEqual(snapshot(root), before)
  })

  it("fails when a listed test passes under its fault", async () => {
    // `sub` is not what the "adds" tests exercise: they stay green.
    const root = repo()
    const result = await verify(root, [
      entry({
        id: "vacuous",
        testName: "adds",
        why: "subtraction broken",
        search: "return a - b",
        replace: "return a * b",
      }),
    ])
    const about = mentions(result, "vacuous")
    assert.equal(about.length, 1, result.failures.join("\n"))
    assert.match(about[0], /PASSES under its fault/)
    assert.match(about[0], /subtraction broken/)
    assert.deepEqual(result.verified, [])
  })

  it("reads `-t` literally and runs only the named tests", async () => {
    // Under the fault, "adds" and "adds a negative" both fail, "subtracts" does not.
    const root = repo()
    const result = await verify(root, [
      entry({ id: "only-subtracts", testName: "subtracts" }),
    ])
    assert.match(
      mentions(result, "only-subtracts")[0],
      /PASSES under its fault.*1 test ran green/
    )
  })

  it("fails when the test fails without any fault", async () => {
    const root = repo({
      "packages/demo/src/index.ts": SOURCE.replace("a + b", "a + b + 1"),
    })
    const result = await verify(root, [entry({ search: "return a + b + 1" })])
    assert.equal(result.failures.length, 1)
    assert.match(result.failures[0], /does not pass without the fault/)
    assert.match(result.failures[0], /failed: arithmetic adds/)
  })

  it("fails when no test matches", async () => {
    const root = repo()
    const result = await verify(root, [entry({ testName: "multiplies" })])
    assert.match(result.failures[0], /matches no test/)
  })

  it("fails when the fault's target has moved", async () => {
    const root = repo()
    const result = await verify(root, [entry({ search: "return a * b" })])
    assert.match(
      result.failures[0],
      /no longer contains .*a \* b.*update the fault/
    )
  })

  it("fails when the fault breaks the test file instead of a behaviour", async () => {
    const root = repo()
    const result = await verify(root, [
      entry({ search: "return a + b", replace: "return a +" }),
    ])
    assert.match(
      result.failures[0],
      /broke the test file instead of the behaviour/
    )
  })

  it("applies several edits of one fault", async () => {
    const root = repo()
    const { file, search, replace, ...rest } = entry({ testName: "subtracts" })
    const result = await verify(root, [
      {
        ...rest,
        edits: [
          { file, search: "return a - b", replace: "return a" },
          { file, search: "return a + b", replace: "return b" },
        ],
      },
    ])
    assert.deepEqual(result.failures, [])
  })

  it("runs one entry with `only`", async () => {
    const root = repo()
    const result = await verify(
      root,
      [entry({ id: "one" }), entry({ id: "two" })],
      { only: "two" }
    )
    assert.deepEqual(result.verified, ["two"])
    const unknown = await verify(root, [entry({ id: "one" })], { only: "nope" })
    assert.match(
      unknown.failures[0],
      /No entry of the manifest has the id "nope"/
    )
  })
})

describe("loadManifest", () => {
  const load = (entries) => {
    const root = repo()
    return loadManifest(manifestFor(root, entries), root)
  }

  it("accepts a flat entry and an entry with `edits`", () => {
    const { entries, problems } = load([
      entry({ id: "flat" }),
      {
        id: "many",
        package: "demo",
        test: "tests/arithmetic.test.ts",
        edits: [{ file: "src/index.ts", search: "a", replace: "b" }],
      },
    ])
    assert.deepEqual(problems, [])
    assert.equal(entries.length, 2)
    assert.equal(entries[0].packageDir, "packages/demo")
    assert.deepEqual(entries[1].edits, [
      { file: "src/index.ts", search: "a", replace: "b" },
    ])
  })

  it("rejects what cannot run", () => {
    const { problems } = load([
      entry({ id: "dup" }),
      entry({ id: "dup" }),
      entry({ id: "no-package", package: "ghost" }),
      entry({ id: "no-test", test: "tests/none.test.ts" }),
      { id: "no-fault", package: "demo", test: "tests/arithmetic.test.ts" },
      { package: "demo" },
    ])
    assert.equal(problems.length, 5, problems.join("\n"))
    assert.match(problems[0], /dup: the id is used twice/)
    assert.match(problems[1], /packages\/ghost is not a package/)
    assert.match(problems[2], /tests\/none\.test\.ts does not exist/)
    assert.match(
      problems[3],
      /needs "file", "search" and "replace", or "edits"/
    )
    assert.match(problems[4], /needs an "id"/)
  })

  it("reads the shipped manifest", () => {
    const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..")
    const { entries, problems } = loadManifest(
      join(repoRoot, "scripts/faults.json"),
      repoRoot
    )
    assert.deepEqual(problems, [])
    assert.ok(entries.length >= 4)
  })
})
