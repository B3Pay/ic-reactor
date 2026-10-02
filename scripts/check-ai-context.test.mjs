/**
 * Tests of `check-ai-context.js` on a small repository of its own: the files
 * an agent reads must not teach a removed 3.x name, must carry the current
 * version, and must be listed as soon as they exist.
 *
 * The script and the lists it imports are copied into the repository, so it
 * runs exactly as it does in this one, from the repository's root.
 *
 * Run by `pnpm test:scripts`.
 */
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { after, describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import { REMOVED_V3_NAMES } from "./removed-v3-names.js"

const scripts = dirname(fileURLToPath(import.meta.url))
const VERSION = "4.0.0-alpha.0"

const GUIDE = `# @ic-reactor/core

Applies to \`@ic-reactor/core\` ${VERSION}.

Create a client with createClient and call a canister with client.canister.
`

const roots = []

/**
 * A repository with the three required files and whatever `files` add or
 * replace (a `null` removes one). Returns its root.
 */
function repo(files = {}) {
  const root = mkdtempSync(join(tmpdir(), "check-ai-context-test-"))
  roots.push(root)
  for (const name of [
    "check-ai-context.js",
    "ai-context-files.js",
    "removed-v3-names.js",
  ]) {
    mkdirSync(join(root, "scripts"), { recursive: true })
    cpSync(join(scripts, name), join(root, "scripts", name))
  }
  const all = {
    "docs/astro.config.mjs": `export default {\n  base: "/v4/",\n}\n`,
    "docs/src/content/docs/index.md": "# Docs\n",
    ...Object.fromEntries(
      ["core", "react", "vite-plugin"].map((name) => [
        `packages/${name}/package.json`,
        JSON.stringify({ name: `@ic-reactor/${name}`, version: VERSION }),
      ])
    ),
    "packages/core/llms.txt": GUIDE,
    "AGENTS.md": "# AGENTS.md\n\nIC Reactor 4 is a thin layer.\n",
    "CLAUDE.md": "# CLAUDE.md — IC Reactor Project Context\n",
    ...files,
  }
  for (const [path, text] of Object.entries(all)) {
    if (text === null) continue
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  return root
}
after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})

/** Runs the check in `root`. */
function check(root) {
  const run = spawnSync(
    process.execPath,
    [join(root, "scripts", "check-ai-context.js")],
    { cwd: root, encoding: "utf8" }
  )
  return { status: run.status, output: `${run.stdout}${run.stderr}` }
}

/** The failure lines of a run. */
const failureLines = (run) =>
  run.output.split("\n").filter((line) => line.startsWith("- "))

/** The guide with `text` added after its stamp. */
const guideWith = (text) => `${GUIDE}\n${text}\n`

describe("check-ai-context on the files as they are", () => {
  it("passes a clean tree", () => {
    const run = check(repo())
    assert.equal(run.status, 0, run.output)
    assert.match(
      run.output,
      /AI context check passed \(3 files, 1 package guides/
    )
  })

  it("passes this repository's own files", () => {
    const run = spawnSync(
      process.execPath,
      [join(scripts, "check-ai-context.js")],
      { cwd: join(scripts, ".."), encoding: "utf8" }
    )
    assert.equal(run.status, 0, run.stdout + run.stderr)
  })
})

describe("stale 3.x names", () => {
  it("fails on a ClientManager mention in the core guide", () => {
    const run = check(
      repo({
        "packages/core/llms.txt": guideWith("Build it with a ClientManager."),
      })
    )
    assert.equal(run.status, 1, run.output)
    const lines = failureLines(run)
    assert.equal(lines.length, 1, run.output)
    assert.match(lines[0], /packages\/core\/llms\.txt:7 mentions ClientManager/)
    assert.match(
      lines[0],
      /use createClient\(\{ network, identity \| auth \}\)/
    )
  })

  it("fails on each of the 34 removed names, wherever it is written", () => {
    assert.equal(REMOVED_V3_NAMES.length, 34)
    // A prose sentence, a code span and a snippet line for each name.
    const lines = REMOVED_V3_NAMES.flatMap(({ name }) =>
      name === "skipToken"
        ? [`Import skipToken from \`@ic-reactor/react\`.`]
        : [`Call ${name} first.`, `Use \`${name}\`.`, `const x = ${name}(1)`]
    )
    const run = check(
      repo({ "packages/core/llms.txt": guideWith(lines.join("\n")) })
    )
    assert.equal(run.status, 1)
    for (const { name } of REMOVED_V3_NAMES) {
      assert.ok(
        failureLines(run).some((line) => line.includes(`mentions ${name},`)),
        `${name} is not reported`
      )
    }
  })

  it("covers AGENTS.md and CLAUDE.md as well as the guide", () => {
    for (const file of ["AGENTS.md", "CLAUDE.md"]) {
      const run = check(repo({ [file]: "Wrap it in createReactorProvider.\n" }))
      assert.equal(run.status, 1, file)
      assert.match(
        run.output,
        new RegExp(`${file}:1 mentions createReactorProvider`)
      )
    }
  })

  it("covers the consumer skill and its references once they exist", () => {
    const skill = (extra = "") =>
      `---\nname: ic-reactor\ndescription: Use IC Reactor.\n---\n\n- \`@ic-reactor/react\`: \`${VERSION}\`\n${extra}`
    const root = repo({
      "skill-packages/ic-reactor/SKILL.md": skill(),
      "skill-packages/ic-reactor/references/setup.md": "Use createQuery.\n",
    })
    const run = check(root)
    assert.equal(run.status, 1, run.output)
    assert.match(run.output, /references\/setup\.md:1 mentions createQuery/)
  })

  it("allows a mention under a heading that begins 'Removed in 4.0'", () => {
    const run = check(
      repo({
        "packages/core/llms.txt": guideWith(
          [
            "## Removed in 4.0",
            "",
            "| 3.x | 4.0 |",
            "| `ClientManager` | `createClient` |",
            "",
            "```ts",
            "// before: new ClientManager({ queryClient })",
            "```",
          ].join("\n")
        ),
      })
    )
    assert.equal(run.status, 0, run.output)
  })

  it("ends the allowance at the next heading of the same level", () => {
    const run = check(
      repo({
        "packages/core/llms.txt": guideWith(
          [
            "## Removed in 4.0",
            "ClientManager is gone.",
            "### What replaced it",
            "formatTokenAmount became formatUnits.",
            "## Testing",
            "Do not build a ClientManager in a test.",
          ].join("\n")
        ),
      })
    )
    assert.equal(run.status, 1)
    const lines = failureLines(run)
    assert.equal(lines.length, 1, run.output)
    assert.match(lines[0], /llms\.txt:12 mentions ClientManager/)
  })

  it("does not open the allowance from a comment in a code fence", () => {
    const run = check(
      repo({
        "packages/core/llms.txt": guideWith(
          ["```sh", "# Removed in 4.0", "```", "", "Use ClientManager."].join(
            "\n"
          )
        ),
      })
    )
    assert.equal(run.status, 1)
    assert.match(run.output, /mentions ClientManager/)
  })

  it("matches whole names only", () => {
    const run = check(
      repo({
        "packages/core/llms.txt": guideWith(
          [
            "ReactorProvider, ReactorError and ReactorProviderProps are 4 names.",
            "createQueryOptions is not createQuery, and DisplayReactors is not one either.",
            "my_createQuery_helper and $createQuery are other words.",
          ].join("\n")
        ),
      })
    )
    assert.equal(run.status, 1, run.output)
    // Only the whole `createQuery` of the second line.
    assert.equal(failureLines(run).length, 1, run.output)
    assert.match(run.output, /llms\.txt:8 mentions createQuery/)
  })

  it("does not take the product name for the Reactor class", () => {
    const ok = check(
      repo({
        "packages/core/llms.txt": guideWith("IC Reactor 4 is a thin layer."),
        "CLAUDE.md": "# CLAUDE.md — IC Reactor Project Context\n",
      })
    )
    assert.equal(ok.status, 0, ok.output)
    const stale = check(
      repo({ "packages/core/llms.txt": guideWith("Make a `Reactor` for it.") })
    )
    assert.equal(stale.status, 1)
    assert.match(stale.output, /mentions Reactor,/)
  })

  it("lets skipToken come from TanStack, and refuses it from ic-reactor", () => {
    const tanstack = check(
      repo({
        "packages/core/llms.txt": guideWith(
          [
            "```ts",
            'import { skipToken, useQuery } from "@tanstack/react-query"',
            "```",
            "Pass skipToken while the owner is unknown.",
          ].join("\n")
        ),
      })
    )
    assert.equal(tanstack.status, 0, tanstack.output)

    const imported = check(
      repo({
        "packages/core/llms.txt": guideWith(
          [
            "```ts",
            "import {",
            "  skipToken,",
            '} from "@ic-reactor/react"',
            "```",
          ].join("\n")
        ),
      })
    )
    assert.equal(imported.status, 1)
    assert.match(imported.output, /llms\.txt:9 mentions skipToken/)

    const sentence = check(
      repo({
        "packages/core/llms.txt": guideWith(
          "Take skipToken from @ic-reactor/react."
        ),
      })
    )
    assert.equal(sentence.status, 1)
  })
})

describe("version stamps", () => {
  it("fails a stamp that names another version", () => {
    const run = check(
      repo({
        "packages/core/llms.txt": GUIDE.replace(VERSION, "4.0.0-alpha.1"),
      })
    )
    assert.equal(run.status, 1)
    assert.match(
      run.output,
      /stamped "Applies to `@ic-reactor\/core` 4\.0\.0-alpha\.1\." but @ic-reactor\/core is at 4\.0\.0-alpha\.0/
    )
  })

  it("fails a guide with no stamp", () => {
    const run = check(repo({ "packages/core/llms.txt": "# core\n" }))
    assert.equal(run.status, 1)
    assert.match(run.output, /has no version stamp/)
  })

  it("lists react's pointer guide once it exists, and stamps it", () => {
    const pointer = (version) =>
      `# @ic-reactor/react\n\nApplies to \`@ic-reactor/react\` ${version}.\n\nRead node_modules/@ic-reactor/core/llms.txt.\n`
    assert.equal(
      check(repo({ "packages/react/llms.txt": pointer(VERSION) })).status,
      0
    )

    const run = check(
      repo({ "packages/react/llms.txt": pointer("4.0.0-alpha.3") })
    )
    assert.equal(run.status, 1)
    assert.match(run.output, /packages\/react\/llms\.txt/)

    // It is part of the checked files from the moment it exists.
    const stale = check(
      repo({
        "packages/react/llms.txt": `${pointer(VERSION)}\nUse defineReactor.\n`,
      })
    )
    assert.equal(stale.status, 1)
    assert.match(
      stale.output,
      /packages\/react\/llms\.txt:\d+ mentions defineReactor/
    )
  })

  it("fails a react pointer guide that has no stamp", () => {
    const run = check(
      repo({
        "packages/react/llms.txt":
          "# @ic-reactor/react\n\nRead core's guide.\n",
      })
    )
    assert.equal(run.status, 1)
    assert.match(
      run.output,
      /packages\/react\/llms\.txt has no version stamp\. Expected line: Applies to `@ic-reactor\/react` 4\.0\.0-alpha\.0\./
    )
  })

  it("requires the core guide, AGENTS.md and CLAUDE.md", () => {
    assert.match(
      check(repo({ "packages/core/llms.txt": null })).output,
      /Missing package AI guide: packages\/core\/llms\.txt/
    )
    assert.match(
      check(repo({ "AGENTS.md": null })).output,
      /Missing AI-context file: AGENTS\.md/
    )
    assert.match(
      check(repo({ "CLAUDE.md": null })).output,
      /Missing AI-context file: CLAUDE\.md/
    )
  })
})
