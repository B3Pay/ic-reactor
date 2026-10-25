/**
 * Tests of the release script (#969): it makes the release commit and stops.
 * It never tags, pushes or publishes, and writes no root `llms.txt`. It
 * refuses the `--dry-run` and `--publish` it used to take before it changes
 * anything, and it ends by printing the release pull request's steps.
 *
 * Each run is of a copy of the script and the scripts it loads, in a
 * repository of its own whose packages, AI-context files and example are
 * stand-ins, marked private. First on the PATH are a `pnpm` that records its
 * arguments and makes the change the real command would make to a file the
 * release commits (`version:sync` rewrites `packages/core/src/version.ts`,
 * `install` the lockfile), and an `npm` that only records them. So a run never
 * touches this repository or reaches npm.
 *
 * Run by `pnpm test:scripts`; it needs `git` and `sh` on the PATH.
 */
import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { delimiter, dirname, join } from "node:path"
import { after, describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import { releasePrSteps } from "./lib/release-pr-steps.mjs"

const scriptsDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(scriptsDir, "..")

/** The script and every module it loads or runs, under `scripts/`. */
const SCRIPTS = [
  "release.js",
  "ai-context-files.js",
  "sync-ai-context-versions.js",
  "sync-example-versions.js",
  "lib/release-pr-steps.mjs",
]

const PREVIOUS = "4.0.0-beta.6"
const NEXT = "4.0.0-beta.7"

// A GIT_DIR or GIT_INDEX_FILE inherited from a git hook would point the
// script's `git add` and `git commit` at this repository.
const env = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_"))
)

const temps = []
function temp(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  temps.push(dir)
  return dir
}
after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true })
})

const json = (value) => JSON.stringify(value, null, 2) + "\n"

/**
 * `git init` on `v4` in `root`, with a committer, no signing and no hooks, and
 * a runner of git there.
 */
function gitRepository(root) {
  const git = (...args) =>
    execFileSync("git", args, { cwd: root, env, encoding: "utf8" }).trim()
  git("init", "-q", "-b", "v4")
  git("config", "user.name", "Release Test")
  git("config", "user.email", "release-test@example.invalid")
  git("config", "commit.gpgsign", "false")
  git("config", "tag.gpgsign", "false")
  git("config", "core.hooksPath", temp("release-hooks-"))
  return git
}

/** A committed repository on `v4` at {@link PREVIOUS}, and recording package managers. */
function repository() {
  const root = temp("release-repo-")
  const write = (path, text) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  for (const script of SCRIPTS) {
    mkdirSync(dirname(join(root, "scripts", script)), { recursive: true })
    copyFileSync(join(scriptsDir, script), join(root, "scripts", script))
  }
  write(
    "package.json",
    json({
      name: "ic-reactor",
      private: true,
      type: "module",
      version: PREVIOUS,
    })
  )
  for (const pkg of ["core", "react", "vite-plugin"]) {
    write(
      `packages/${pkg}/package.json`,
      json({ name: `@ic-reactor/${pkg}`, private: true, version: PREVIOUS })
    )
  }
  write(
    "packages/core/src/version.ts",
    `export const VERSION = "${PREVIOUS}"\n`
  )
  write("packages/core/llms.txt", `Applies to @ic-reactor/core ${PREVIOUS}\n`)
  write("AGENTS.md", `| \`@ic-reactor/core\` | \`${PREVIOUS}\` |\n`)
  write("CLAUDE.md", `- \`@ic-reactor/react\` (\`${PREVIOUS}\`)\n`)
  write("pnpm-lock.yaml", "lockfileVersion: '9.0'\n")
  write(
    "examples/app/package.json",
    json({ name: "app", dependencies: { "@ic-reactor/react": `^${PREVIOUS}` } })
  )

  const bin = temp("release-bin-")
  const stub = (name, body = "") => {
    writeFileSync(
      join(bin, name),
      `#!/bin/sh\necho "$*" >> "${join(bin, `${name}.log`)}"\n${body}`
    )
    chmodSync(join(bin, name), 0o755)
  }
  // Run in the repository root, as release.js runs it.
  stub(
    "pnpm",
    `case "$*" in
  *version:sync)
    version=$(node -p 'require("./packages/core/package.json").version')
    printf 'export const VERSION = "%s"\\n' "$version" > packages/core/src/version.ts ;;
  install*) echo "# installed" >> pnpm-lock.yaml ;;
esac
`
  )
  stub("npm")
  const calls = (name) => {
    const log = join(bin, `${name}.log`)
    return existsSync(log) ? readFileSync(log, "utf8").trim().split("\n") : []
  }

  const git = gitRepository(root)
  git("add", "-A")
  git("commit", "-q", "-m", "base")
  // Untracked, so it must stay out of the release commit.
  write("examples/app/notes.txt", "scratch\n")

  const release = (...args) =>
    spawnSync(
      process.execPath,
      [join(root, "scripts", "release.js"), ...args],
      {
        cwd: root,
        encoding: "utf8",
        env: {
          ...env,
          PATH: [bin, dirname(process.execPath), env.PATH].join(delimiter),
        },
      }
    )
  return { root, git, release, calls }
}

describe("release.js", () => {
  it("commits the release, tags nothing, publishes nothing and prints the release-PR steps", () => {
    const { root, git, release, calls } = repository()
    const run = release(NEXT)
    const output = run.stdout + run.stderr

    assert.equal(run.status, 0, output)
    // The llms.txt step it dropped failed on every run, as v4 has no root one.
    assert.deepEqual(
      output.split("\n").filter((line) => line.includes("❌")),
      []
    )
    assert.equal(existsSync(join(root, "llms.txt")), false)

    assert.deepEqual(git("log", "--format=%s").split("\n"), [
      `chore: release v${NEXT}`,
      "base",
    ])
    assert.deepEqual(
      git("diff", "--name-only", "HEAD~1", "HEAD").split("\n").sort(),
      [
        "AGENTS.md",
        "CLAUDE.md",
        "examples/app/package.json",
        "package.json",
        "packages/core/llms.txt",
        "packages/core/package.json",
        "packages/core/src/version.ts",
        "packages/react/package.json",
        "packages/vite-plugin/package.json",
        "pnpm-lock.yaml",
      ]
    )
    assert.equal(git("status", "--porcelain"), "?? examples/app/notes.txt")
    assert.equal(git("tag", "--list"), "")
    assert.deepEqual(calls("pnpm"), [
      "--filter @ic-reactor/core version:sync",
      "install --no-frozen-lockfile",
    ])
    assert.deepEqual(calls("npm"), [])

    assert.ok(
      run.stdout.endsWith(`${releasePrSteps(NEXT)}\n`),
      `expected the release-PR steps at the end:\n${run.stdout}`
    )
  })

  for (const flag of ["--dry-run", "--publish"]) {
    it(`refuses ${flag} before it changes anything`, () => {
      const { git, release, calls } = repository()
      const run = release(NEXT, flag)

      assert.equal(run.status, 1, run.stdout + run.stderr)
      assert.match(
        run.stderr,
        new RegExp(`^Refusing ${flag}: release\\.js takes only a version\\.`)
      )
      assert.equal(git("log", "--format=%s"), "base")
      assert.equal(git("status", "--porcelain"), "?? examples/app/notes.txt")
      assert.equal(git("tag", "--list"), "")
      assert.deepEqual(calls("pnpm"), [])
      assert.deepEqual(calls("npm"), [])
    })
  }
})

describe("releasePrSteps", () => {
  const steps = releasePrSteps(NEXT)
  const lines = steps.split("\n").map((line) => line.trim())
  const at = (command) => {
    const index = lines.indexOf(command)
    assert.notEqual(index, -1, `missing \`${command}\` in:\n${steps}`)
    return index
  }

  const lookup = lines.find((line) => line.startsWith("git log origin/v4 "))

  it("pushes the release branch, and tags the merge commit after the merge", () => {
    const push = at(`git push origin HEAD:refs/heads/release/v${NEXT}`)
    const fetch = at("git fetch origin v4")
    const find = at(lookup)
    const tag = at(`git tag -a v${NEXT} -m "ic-reactor ${NEXT}" <merge-commit>`)
    const pushTag = at(`git push origin v${NEXT}`)
    assert.ok(
      push < fetch && fetch < find && find < tag && tag < pushTag,
      steps
    )
  })

  it("finds the release pull request's merge commit, not v4's head", () => {
    const root = temp("release-merges-")
    const git = gitRepository(root)
    const commit = (file) => {
      writeFileSync(join(root, file), `${file}\n`)
      git("add", file)
      git("commit", "-q", "-m", file)
    }
    // Merge `branch` into v4 with the message GitHub gives a pull request.
    const merge = (number, branch) => {
      git("switch", "-q", "-c", branch)
      commit(branch.replaceAll("/", "-"))
      git("switch", "-q", "v4")
      git(
        "merge",
        "-q",
        "--no-ff",
        "-m",
        `Merge pull request #${number} from B3Pay/${branch}`,
        branch
      )
      return git("rev-parse", "HEAD")
    }
    commit("base")
    const released = merge(1, `release/v${NEXT}`)
    // Merged after it: a release whose version starts with this one's, and a
    // branch whose name differs only where this one has a dot.
    merge(2, `release/v${NEXT}0`)
    merge(3, `release/v${NEXT.replace(/\.(?=[^.]*$)/, "x")}`)
    git("update-ref", "refs/remotes/origin/v4", "v4")

    const found = execFileSync("sh", ["-c", lookup], {
      cwd: root,
      env,
      encoding: "utf8",
    })
    assert.equal(
      found.trim(),
      `${released} Merge pull request #1 from B3Pay/release/v${NEXT}`
    )
  })

  it("pushes one ref at a time, and never v4 itself or every tag", () => {
    const pushes = lines.filter((line) => line.startsWith("git push"))
    assert.deepEqual(pushes, [
      `git push origin HEAD:refs/heads/release/v${NEXT}`,
      `git push origin v${NEXT}`,
    ])
    assert.doesNotMatch(steps, /--tags|--publish|--dry-run|npm publish/)
  })

  it("opens the pull request against v4, not the default branch", () => {
    at(
      `https://github.com/B3Pay/ic-reactor/compare/v4...release/v${NEXT}?expand=1`
    )
  })

  it("names the CHANGELOG section the way the released ones are named", () => {
    const changelog = readFileSync(join(repoRoot, "CHANGELOG.md"), "utf8")
    const [heading, version] =
      changelog.match(/^## core, react, vite-plugin (4\.\S+)$/m) ?? []
    assert.ok(heading, "CHANGELOG.md has no released 4.x section")
    const expected = heading.replace(version, NEXT)
    assert.ok(
      steps.includes(`"${expected}"`),
      `expected "${expected}" in:\n${steps}`
    )
  })
})
