/**
 * Tests of what verify-test-fails decides: the base it compares with by
 * default, how each test's two results sort, and the exit code.
 *
 * Run by `pnpm test:scripts`.
 */
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, describe, it } from "node:test"
import {
  classify,
  defaultBase,
  exitCodeFor,
} from "./verify-test-fails-rules.mjs"

const statuses = (entries) => new Map(Object.entries(entries))

describe("classify", () => {
  it("counts a test that fails on the base and passes now as catching the bug", () => {
    const groups = classify(
      statuses({ caught: "passed" }),
      statuses({ caught: "failed" })
    )
    assert.deepEqual(groups.discriminating, ["caught"])
  })

  it("counts a test that passes on both as passing either way", () => {
    const groups = classify(
      statuses({ guard: "passed" }),
      statuses({ guard: "passed" })
    )
    assert.deepEqual(groups.bothPass, ["guard"])
  })

  it("counts a test with no result on the base as no evidence, not as passing either way", () => {
    // The base's sources could not load the file (v3, 3.x, under a 4.x
    // test), so the base run reported nothing for it (#968).
    const groups = classify(statuses({ unloaded: "passed" }), new Map())
    assert.deepEqual(groups.noBaseResult, ["unloaded"])
    assert.deepEqual(groups.bothPass, [])
  })

  it("counts a test skipped on the base as no evidence", () => {
    const groups = classify(
      statuses({
        "skipped there": "passed",
        "todo there": "passed",
        "pending there": "passed",
      }),
      statuses({
        "skipped there": "skipped",
        "todo there": "todo",
        "pending there": "pending",
      })
    )
    assert.deepEqual(groups.noBaseResult, [
      "skipped there",
      "todo there",
      "pending there",
    ])
  })

  it("keeps a test that fails or is skipped now apart, whatever the base says", () => {
    const groups = classify(
      statuses({ broken: "failed", later: "skipped" }),
      statuses({ broken: "failed", later: "failed" })
    )
    assert.deepEqual(groups.failingNow, ["broken"])
    assert.deepEqual(groups.skipped, ["later"])
    assert.deepEqual(groups.discriminating, [])
  })
})

describe("exitCodeFor", () => {
  const groups = (counts) => ({
    discriminating: [],
    bothPass: [],
    noBaseResult: [],
    failingNow: [],
    skipped: [],
    ...Object.fromEntries(
      Object.entries(counts).map(([group, n]) => [
        group,
        Array.from({ length: n }, (_, i) => `${group} ${i}`),
      ])
    ),
  })

  it("is 0 when a test caught the bug and every other one has a result on the base", () => {
    assert.equal(exitCodeFor(groups({ discriminating: 1, bothPass: 2 })), 0)
  })

  it("is 2 when a test has no result on the base, even beside one that caught the bug", () => {
    assert.equal(exitCodeFor(groups({ noBaseResult: 12 })), 2)
    assert.equal(exitCodeFor(groups({ discriminating: 1, noBaseResult: 1 })), 2)
  })

  it("is 2 when no test distinguishes the fix", () => {
    assert.equal(exitCodeFor(groups({ bothPass: 3 })), 2)
    assert.equal(exitCodeFor(groups({ skipped: 3 })), 2)
  })

  it("is 1 when a test fails now", () => {
    assert.equal(
      exitCodeFor(
        groups({ failingNow: 1, discriminating: 1, noBaseResult: 1 })
      ),
      1
    )
  })
})

describe("defaultBase", () => {
  const dirs = []
  after(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
  })

  /**
   * A repository whose `main` has A then C, and a branch `fix` that left it at A
   * and added B, checked out. Each test gets its own.
   */
  function repository() {
    const dir = mkdtempSync(join(tmpdir(), "vtf-base-"))
    dirs.push(dir)
    const git = (...args) =>
      execFileSync(
        "git",
        [
          "-c",
          "user.name=test",
          "-c",
          "user.email=test@example.invalid",
          "-c",
          "commit.gpgsign=false",
          ...args,
        ],
        { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
      ).trim()
    const commit = (message) => {
      writeFileSync(join(dir, "file.txt"), message)
      git("add", "file.txt")
      git("commit", "-q", "--no-verify", "-m", message)
      return git("rev-parse", "HEAD")
    }
    git("init", "-q", "-b", "main")
    const left = commit("A")
    git("checkout", "-q", "-b", "fix")
    const fix = commit("B")
    git("checkout", "-q", "main")
    const moved = commit("C")
    git("checkout", "-q", "fix")
    return { git, commit, left, fix, moved }
  }

  it("is where the branch left the local main, not main's tip", () => {
    const { git, left } = repository()
    assert.deepEqual(defaultBase(git), { line: "main", commit: left })
  })

  it("is where the branch left origin/main in a clone with no local main, as a fresh clone of another branch has", () => {
    const { git, left, moved } = repository()
    git("update-ref", "refs/remotes/origin/main", moved)
    git("branch", "-q", "-D", "main")
    assert.deepEqual(defaultBase(git), { line: "origin/main", commit: left })
  })

  it("is the newer branch point when the local main is behind origin/main", () => {
    // The branch left origin/main at C, which the stale local main never got.
    // Reverting to A would also undo C, and a test could fail there for C.
    const { git, commit, left, moved } = repository()
    git("update-ref", "refs/remotes/origin/main", moved)
    git("checkout", "-q", "-B", "fix", moved)
    commit("B'")
    git("branch", "-q", "-f", "main", left)
    assert.deepEqual(defaultBase(git), { line: "origin/main", commit: moved })
  })

  it("is the newer branch point when origin/main is behind the local main", () => {
    const { git, left, moved } = repository()
    git("update-ref", "refs/remotes/origin/main", left)
    git("checkout", "-q", "-B", "fix", "main")
    assert.deepEqual(defaultBase(git), { line: "main", commit: moved })
  })

  it("is HEAD on main itself", () => {
    const { git, moved } = repository()
    git("checkout", "-q", "main")
    assert.deepEqual(defaultBase(git), { line: "main", commit: moved })
  })

  it("reads the branch main, not a tag of that name", () => {
    const { git, left, fix } = repository()
    git("tag", "main", fix)
    assert.deepEqual(defaultBase(git), { line: "main", commit: left })
  })

  it("is where a branch cut from v4 left it, while v4 is still listed", () => {
    // Before the flip main is 3.x, behind v4: its merge base would be older.
    const { git, commit, left, moved } = repository()
    git("branch", "-q", "v4", moved)
    git("branch", "-q", "-f", "main", left)
    git("checkout", "-q", "-B", "fix", "v4")
    commit("D")
    assert.deepEqual(defaultBase(git), { line: "v4", commit: moved })
  })

  it("is undefined with neither, so the script asks for --base instead of guessing v3", () => {
    const { git, left } = repository()
    git("branch", "-q", "v3", left)
    git("checkout", "-q", "v3")
    git("branch", "-q", "-D", "main")
    assert.equal(defaultBase(git), undefined)
  })

  it("throws when HEAD shares no history with the line", () => {
    const { git } = repository()
    git("checkout", "-q", "--orphan", "unrelated")
    git("commit", "-q", "--no-verify", "-m", "unrelated")
    assert.throws(() => defaultBase(git), /HEAD shares no history with main/)
  })
})
