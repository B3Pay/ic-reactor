/**
 * Tests that `check:snippets` compiles the code of every AI-context file, so
 * the guide DX3 writes into `packages/core/llms.txt` is gated the moment it
 * lands, and a snippet that stops compiling fails the run.
 *
 * It runs the script in a repository of its own: a copy of `scripts/` and the
 * three packages, each a directory holding links to the real `dist` and
 * installs, with the guides the test writes. It compiles against the built
 * declarations, so run `pnpm build` first.
 *
 * Run by `pnpm test:scripts`.
 */
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { after, before, describe, it } from "node:test"
import { fileURLToPath } from "node:url"

const repoRoot = realpathSync(
  join(dirname(fileURLToPath(import.meta.url)), "..")
)

const STAMP = "Applies to `@ic-reactor/core` 4.0.0-alpha.0."

/** A guide with `fences` after its stamp, each a fenced block. */
const guide = (...fences) =>
  `# @ic-reactor/core\n\n${STAMP}\n\n${fences.join("\n\n")}\n`

const fence = (code, info = "ts") => "```" + info + "\n" + code + "\n```"

const GOOD = fence(
  [
    'import { formatUnits, parseUnits } from "@ic-reactor/core"',
    "",
    'export const amount: bigint = parseUnits("1.5", 8)',
    "export const text: string = formatUnits(amount, 8)",
  ].join("\n")
)

/** The same call with an argument the type refuses: a Number is lossy. */
const BROKEN = fence(
  [
    'import { parseUnits } from "@ic-reactor/core"',
    "",
    "export const amount = parseUnits(1.5, 8)",
  ].join("\n")
)

const roots = []
const links = []

/**
 * A repository whose AI-context files are `files` (paths relative to its
 * root). Returns the root.
 */
function repo(files) {
  const root = mkdtempSync(join(tmpdir(), "check-snippets-test-"))
  roots.push(root)
  const link = (target, path) => {
    mkdirSync(dirname(path), { recursive: true })
    symlinkSync(target, path, "dir")
    links.push(path)
  }
  cpSync(join(repoRoot, "scripts"), join(root, "scripts"), { recursive: true })
  // Each package is a directory of its own holding links to the real build and
  // installs, never a link to the package: a file the test writes into it must
  // not land in the repository.
  for (const name of ["core", "react", "vite-plugin"]) {
    const from = join(repoRoot, "packages", name)
    const to = join(root, "packages", name)
    mkdirSync(to, { recursive: true })
    cpSync(join(from, "package.json"), join(to, "package.json"))
    for (const entry of ["dist", "node_modules"]) {
      if (existsSync(join(from, entry)))
        link(join(from, entry), join(to, entry))
    }
  }
  link(join(repoRoot, "node_modules"), join(root, "node_modules"))
  // The docs pages also compile against what the Next.js example installs.
  const nextSsr = join(repoRoot, "examples", "next-ssr", "node_modules")
  if (existsSync(nextSsr))
    link(nextSsr, join(root, "examples", "next-ssr", "node_modules"))
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  return root
}

before(() => {
  assert.ok(
    existsSync(join(repoRoot, "packages/core/dist/index.d.ts")),
    "packages/core is not built: run `pnpm build` first"
  )
})
after(() => {
  // The links point into the real repository: remove them before the trees.
  for (const path of links) unlinkSync(path)
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})

/** Runs `check-snippets` in `root`. */
function check(root, ...args) {
  const run = spawnSync(
    process.execPath,
    [join(root, "scripts", "check-snippets.mjs"), ...args],
    { cwd: root, encoding: "utf8", timeout: 120_000 }
  )
  return { status: run.status, output: `${run.stdout}${run.stderr}` }
}

describe("check:snippets compiles the AI-context files", () => {
  it("passes a guide whose snippets compile, and names it in the verbose list", () => {
    const root = repo({
      "packages/core/llms.txt": guide(GOOD),
      "AGENTS.md": "# AGENTS.md\n",
      "CLAUDE.md": "# CLAUDE.md\n",
    })
    const run = check(root, "--verbose")
    assert.equal(run.status, 0, run.output)
    assert.match(run.output, /^ok\s+packages\/core\/llms\.txt:5$/m)
    assert.match(run.output, /Every checked snippet compiles/)
  })

  it("fails a broken fence in packages/core/llms.txt, at the line of the fence", () => {
    const root = repo({
      "packages/core/llms.txt": guide(GOOD, BROKEN),
      "AGENTS.md": "# AGENTS.md\n",
      "CLAUDE.md": "# CLAUDE.md\n",
    })
    const run = check(root)
    assert.equal(run.status, 1, run.output)
    // GOOD fills lines 5 to 10, BROKEN opens at line 12, and its call is on line 15.
    assert.match(run.output, /packages\/core\/llms\.txt:15:34 TS2345/)
    assert.match(run.output, /Fix each failing snippet in its file/)
  })

  it("gives the guide no globals: a name it does not import is an error", () => {
    const root = repo({
      "packages/core/llms.txt": guide(
        fence("export const x = client.queryKey()")
      ),
      "AGENTS.md": "# AGENTS.md\n",
      "CLAUDE.md": "# CLAUDE.md\n",
    })
    const run = check(root)
    assert.equal(run.status, 1, run.output)
    assert.match(run.output, /packages\/core\/llms\.txt:\d+:\d+ TS2304.*client/)
  })

  it("compiles a fence in AGENTS.md and CLAUDE.md as well", () => {
    for (const file of ["AGENTS.md", "CLAUDE.md"]) {
      const root = repo({
        "packages/core/llms.txt": guide(GOOD),
        "AGENTS.md": "# AGENTS.md\n",
        "CLAUDE.md": "# CLAUDE.md\n",
        [file]: `# ${file}\n\n${BROKEN}\n`,
      })
      const run = check(root)
      assert.equal(run.status, 1, `${file}: ${run.output}`)
      assert.match(
        run.output,
        new RegExp(`${file.replace(".", "\\.")}:\\d+:\\d+ TS2345`)
      )
    }
  })

  it("compiles the consumer skill and react's pointer guide once they exist", () => {
    const skill = `---\nname: ic-reactor\ndescription: Use it.\n---\n\n${BROKEN}\n`
    const run = check(
      repo({
        "packages/core/llms.txt": guide(GOOD),
        "AGENTS.md": "# AGENTS.md\n",
        "CLAUDE.md": "# CLAUDE.md\n",
        "skill-packages/ic-reactor/SKILL.md": skill,
      })
    )
    assert.equal(run.status, 1, run.output)
    assert.match(
      run.output,
      /skill-packages\/ic-reactor\/SKILL\.md:\d+:\d+ TS2345/
    )

    const pointer = check(
      repo({
        "packages/core/llms.txt": guide(GOOD),
        "packages/react/llms.txt": guide(BROKEN),
        "AGENTS.md": "# AGENTS.md\n",
        "CLAUDE.md": "# CLAUDE.md\n",
      })
    )
    assert.equal(pointer.status, 1, pointer.output)
    assert.match(pointer.output, /packages\/react\/llms\.txt:\d+:\d+ TS2345/)
  })

  it("skips a fence marked `nocheck`, and only that fence", () => {
    const skipped = check(
      repo({
        "packages/core/llms.txt": guide(
          fence("parseUnits(1.5, 8)", "ts nocheck")
        ),
        "AGENTS.md": "# AGENTS.md\n",
        "CLAUDE.md": "# CLAUDE.md\n",
      })
    )
    assert.equal(skipped.status, 0, skipped.output)
  })
})

// `--docs` compiles against libraries only the example apps install, and the
// checker refuses to run without them. CI's Test job installs the workspace
// without the examples, so this suite runs in the Type Check Examples job,
// which installs them (`.github/workflows/ci.yml`), and is skipped elsewhere.
const examplesInstalled = readdirSync(join(repoRoot, "examples"), {
  withFileTypes: true,
}).every(
  (entry) =>
    !entry.isDirectory() ||
    !existsSync(join(repoRoot, "examples", entry.name, "package.json")) ||
    existsSync(join(repoRoot, "examples", entry.name, "node_modules"))
)

describe(
  "check:snippets --docs compiles the docs pages",
  {
    skip: examplesInstalled
      ? false
      : "the examples are not installed; the Type Check Examples job runs this suite",
  },
  () => {
    it("keeps a fence's triple-slash directive above the globals it is given", () => {
      // `Intl.StringNumericLiteral` exists only with lib ES2023, which the
      // directive adds; `principal` comes from the docs globals, so the checker
      // adds an import for it, and that import must not push the directive down.
      const page = (code) => `---\ntitle: Values\n---\n\n${fence(code)}\n`
      const run = check(
        repo({
          "docs/src/content/docs/guides/values.mdx": page(
            [
              '/// <reference lib="es2023.intl" />',
              'const text = "1234.5" as Intl.StringNumericLiteral',
              'console.log(new Intl.NumberFormat("de-DE").format(text), principal.toText())',
            ].join("\n")
          ),
        }),
        "--docs"
      )
      assert.equal(run.status, 0, run.output)
    })
  }
)
