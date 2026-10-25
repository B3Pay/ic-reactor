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
    // The base's sources could not load the file (main, 3.x, under a v4
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
   * A repository whose `v4` has A then C, and a branch `fix` that left it at A
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
    git("init", "-q", "-b", "v4")
    const left = commit("A")
    git("checkout", "-q", "-b", "fix")
    const fix = commit("B")
    git("checkout", "-q", "v4")
    const moved = commit("C")
    git("checkout", "-q", "fix")
    return { git, commit, left, fix, moved }
  }

  it("is where the branch left the local v4, not v4's tip", () => {
    const { git, left } = repository()
    assert.deepEqual(defaultBase(git), { line: "v4", commit: left })
  })

  it("is where the branch left origin/v4 in a clone with no local v4, as a fresh clone of another branch has", () => {
    const { git, left, moved } = repository()
    git("update-ref", "refs/remotes/origin/v4", moved)
    git("branch", "-q", "-D", "v4")
    assert.deepEqual(defaultBase(git), { line: "origin/v4", commit: left })
  })

  it("is the newer branch point when the local v4 is behind origin/v4", () => {
    // The branch left origin/v4 at C, which the stale local v4 never got.
    // Reverting to A would also undo C, and a test could fail there for C.
    const { git, commit, left, moved } = repository()
    git("update-ref", "refs/remotes/origin/v4", moved)
    git("checkout", "-q", "-B", "fix", moved)
    commit("B'")
    git("branch", "-q", "-f", "v4", left)
    assert.deepEqual(defaultBase(git), { line: "origin/v4", commit: moved })
  })

  it("is the newer branch point when origin/v4 is behind the local v4", () => {
    const { git, left, moved } = repository()
    git("update-ref", "refs/remotes/origin/v4", left)
    git("checkout", "-q", "-B", "fix", "v4")
    assert.deepEqual(defaultBase(git), { line: "v4", commit: moved })
  })

  it("is HEAD on v4 itself", () => {
    const { git, moved } = repository()
    git("checkout", "-q", "v4")
    assert.deepEqual(defaultBase(git), { line: "v4", commit: moved })
  })

  it("reads the branch v4, not a tag of that name", () => {
    const { git, left, fix } = repository()
    git("tag", "v4", fix)
    assert.deepEqual(defaultBase(git), { line: "v4", commit: left })
  })

  it("is undefined with neither, so the script asks for --base instead of guessing main", () => {
    const { git, left } = repository()
    git("branch", "-q", "main", left)
    git("checkout", "-q", "main")
    git("branch", "-q", "-D", "v4")
    assert.equal(defaultBase(git), undefined)
  })

  it("throws when HEAD shares no history with the line", () => {
    const { git } = repository()
    git("checkout", "-q", "--orphan", "unrelated")
    git("commit", "-q", "--no-verify", "-m", "unrelated")
    assert.throws(() => defaultBase(git), /HEAD shares no history with v4/)
  })
})
