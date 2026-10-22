/**
 * Tests of the trap verifier, against a small repository of its own: what it
 * must accept, and every way a trap can fail to prove itself.
 *
 * Run by `pnpm test:scripts`.
 */
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { after, describe, it } from "node:test"
import { parseTraps, verifyTraps } from "./verify-traps.mjs"

/**
 * `value` as a JavaScript literal to write into a generated module: JSON, with
 * the characters that could end a string or a script escaped as well.
 */
const jsLiteral = (value) =>
  JSON.stringify(value).replace(
    /[<>/\u2028\u2029]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`
  )

const SUITE = {
  package: "packages/demo",
  file: "tests/traps.test-d.ts",
  tsconfig: "tsconfig.typecheck.json",
}

const SOURCE = `export function double(n: number): number {
  return n * 2
}

export function label(text: string, upper?: boolean): string {
  return upper ? text.toUpperCase() : text
}

export function lengthOf(text: string): number {
  return text.length
}
`

const TRAPS = `import { double, label } from "../src/index.js"

// trap: double-refuses-text
// @ts-expect-error a number is doubled, not text
double("2")

// trap: label-refuses-a-number
// @ts-expect-error text is labelled, not a number
label(5)
`

/**
 * A repository of one package, with the given files. Returns its root.
 *
 * @param {Record<string, string>} files Paths relative to the root. A
 *   `traps.test-d.ts` and the fixtures are in `files`; the package's
 *   configuration and source are the defaults below.
 */
const roots = []
function repo(files) {
  const root = mkdtempSync(join(tmpdir(), "verify-traps-test-"))
  roots.push(root)
  const all = {
    "tsconfig.base.json": JSON.stringify({
      compilerOptions: {
        strict: true,
        target: "ES2020",
        module: "ESNext",
        moduleResolution: "bundler",
        noEmit: true,
        skipLibCheck: true,
        types: [],
      },
    }),
    "packages/demo/package.json": JSON.stringify({
      name: "demo",
      type: "module",
    }),
    "packages/demo/tsconfig.json": JSON.stringify({
      extends: "../../tsconfig.base.json",
      include: ["src/**/*"],
    }),
    "packages/demo/tsconfig.typecheck.json": JSON.stringify({
      extends: "./tsconfig.json",
      compilerOptions: { rootDir: "." },
      include: ["src/**/*", "tests/**/*"],
      exclude: ["node_modules", "dist"],
    }),
    "packages/demo/src/index.ts": SOURCE,
    "packages/demo/tests/traps.test-d.ts": TRAPS,
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

/** A JSON fault fixture for `id`. */
const fixture = (id, fault) => ({
  [`scripts/traps/${id}.json`]: JSON.stringify(fault),
})

/** Widens `double` to take text, and repairs its body: the whole fault. */
const doubleEdits = [
  {
    file: "src/index.ts",
    search: "export function double(n: number): number {\n  return n * 2",
    replace:
      "export function double(n: number | string): number {\n  return Number(n) * 2",
  },
]
/** Widens `label` to take a number, and repairs its body. */
const labelEdits = [
  {
    file: "src/index.ts",
    search:
      "export function label(text: string, upper?: boolean): string {\n  return upper ? text.toUpperCase() : text",
    replace:
      "export function label(text: string | number, upper?: boolean): string {\n  return upper ? String(text).toUpperCase() : String(text)",
  },
]
const doubleFault = { edits: doubleEdits }
const labelFault = { edits: labelEdits }

const verify = (root, options = {}) =>
  verifyTraps({ repoRoot: root, suites: [SUITE], jobs: 2, ...options })

/** Every file under `dir` with a hash of its content. */
function snapshot(dir) {
  const found = {}
  const walk = (current) => {
    for (const name of readdirSync(current)) {
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

const mentions = (result, text) =>
  result.failures.filter((f) => f.includes(text))

describe("parseTraps", () => {
  it("reads the tag and the line of the directive under it", () => {
    const { traps, problems } = parseTraps(TRAPS)
    assert.deepEqual(problems, [])
    assert.deepEqual(traps, [
      { id: "double-refuses-text", line: 4 },
      { id: "label-refuses-a-number", line: 8 },
    ])
  })

  it("does not take a mention in prose for a directive", () => {
    const { traps, problems } = parseTraps(
      [
        "/**",
        " * A `@ts-expect-error` is only worth something while it traps.",
        " *    // @ts-expect-error written as an example, in a doc comment",
        " * Do not use @ts-ignore or @ts-nocheck here.",
        " */",
        "ok() // a trailing comment that mentions @ts-ignore in a sentence",
        'const inAString = "a() // @ts-ignore"',
        "const inATemplate = `b() // @ts-expect-error ${inAString}`",
        "// trap: real-one",
        "// @ts-expect-error a real directive",
        "bad()",
      ].join("\n")
    )
    assert.deepEqual(problems, [])
    assert.deepEqual(traps, [{ id: "real-one", line: 10 }])
  })

  it("flags a directive written after code on its line, as TypeScript reads it", () => {
    // TypeScript honours `// @ts-ignore` and `// @ts-expect-error` after
    // code too (#971).
    const { problems } = parseTraps(
      [
        "a() // @ts-ignore",
        "bad()",
        "b() /* @ts-ignore */",
        "bad()",
        "c() /// @ts-expect-error untagged, after code",
        "bad()",
        'const url = "https://example.com" // @ts-ignore after a string',
        "bad()",
        "/* a block */ // @ts-ignore after a block comment",
        "bad()",
        "/*",
        " * a doc comment */ d() // @ts-ignore after the comment closes",
        "bad()",
      ].join("\n")
    )
    assert.deepEqual(
      problems.map((problem) => problem.match(/^line (\d+)/)?.[1]),
      ["1", "3", "5", "7", "9", "12"],
      problems.join("\n")
    )
    assert.match(problems[0], /line 1: @ts-ignore and @ts-nocheck/)
    assert.match(problems[2], /line 5: this @ts-expect-error has no/)
  })

  it("flags a directive at the start of a block comment's last line", () => {
    for (const last of ["@ts-ignore */", " * @ts-ignore */"]) {
      const { problems } = parseTraps(
        ["/* a comment whose last line is", last, "bad()"].join("\n")
      )
      assert.equal(problems.length, 1, problems.join("\n"))
      assert.match(problems[0], /line 2: @ts-ignore and @ts-nocheck/)
    }
  })

  it("flags what TypeScript reads where a line pattern cannot tell", () => {
    const { problems } = parseTraps(
      [
        "const n = 3",
        "  * 2 // @ts-ignore after a multiplication",
        "bad()",
        "class Counter {",
        "  *values() { // @ts-ignore after a generator method",
        "    yield bad()",
        "  }",
        "}",
        "a() // @ts-ignored",
        "bad()",
        "b() // @ts-expect-errors",
        "bad()",
      ].join("\n")
    )
    assert.deepEqual(
      problems.map((problem) => problem.match(/^line (\d+)/)?.[1]),
      ["2", "5", "9", "11"],
      problems.join("\n")
    )
    assert.match(problems[2], /line 9: @ts-ignore and @ts-nocheck/)
    assert.match(problems[3], /line 11: this @ts-expect-error has no/)
  })

  it("flags a @ts-nocheck TypeScript obeys after a comment on the first line", () => {
    const { problems } = parseTraps("/* a */ // @ts-nocheck\nbad()\n")
    assert.equal(problems.length, 1, problems.join("\n"))
    assert.match(problems[0], /line 1: @ts-ignore and @ts-nocheck/)
  })

  it("refuses a tag whose directive follows code on its line", () => {
    const { traps, problems } = parseTraps(
      "// trap: trailing\nsetUp() // @ts-expect-error the next line is wrong\nbad()\n"
    )
    assert.deepEqual(traps, [])
    assert.equal(problems.length, 1, problems.join("\n"))
    assert.match(
      problems[0],
      /line 1: the tag "trap: trailing" must be followed by a line that starts with its/
    )
  })

  it("counts lines as the file does, past a U+2028 in a string", () => {
    // TypeScript also breaks lines at U+2028 and U+2029; a directive after
    // one is still on the line the file's "\n"s give it.
    const { problems } = parseTraps(
      [
        'export const a = "\u2028\u2029"',
        "ok() // @ts-ignore",
        "export const b: string = 1",
      ].join("\n")
    )
    assert.equal(problems.length, 1, problems.join("\n"))
    assert.match(problems[0], /line 2: @ts-ignore and @ts-nocheck/)
  })

  it("still flags a directive that starts a line TypeScript does not read, as before", () => {
    const { problems } = parseTraps(
      ["/**", " * @ts-expect-error in the middle of a doc comment", " */"].join(
        "\n"
      )
    )
    assert.equal(problems.length, 1, problems.join("\n"))
    assert.match(problems[0], /line 2: this @ts-expect-error has no/)
  })

  it("flags a directive with no tag, a tag with no directive, and ts-ignore", () => {
    const { problems } = parseTraps(
      [
        "// @ts-expect-error nothing proves this one",
        "bad()",
        "// trap: dangling",
        "good()",
        "// @ts-ignore",
        "bad()",
        "// @ts-nocheck",
      ].join("\n")
    )
    assert.equal(problems.length, 4, problems.join("\n"))
    assert.match(
      problems[0],
      /line 3: the tag "trap: dangling" must be followed/
    )
    assert.match(
      problems[1],
      /line 1: this @ts-expect-error has no "\/\/ trap: <id>" tag/
    )
    assert.match(problems[2], /line 5: @ts-ignore and @ts-nocheck/)
  })

  it("lets several lines share an id", () => {
    const { traps } = parseTraps(
      "// trap: one\n// @ts-expect-error a\nx()\n// trap: one\n// @ts-expect-error b\ny()\n"
    )
    assert.deepEqual(traps, [
      { id: "one", line: 2 },
      { id: "one", line: 5 },
    ])
  })
})

describe("verifyTraps", () => {
  it("passes when each fault makes its trap unused and changes nothing else", async () => {
    const root = repo({
      ...fixture("double-refuses-text", doubleFault),
      ...fixture("label-refuses-a-number", labelFault),
    })
    const result = await verify(root)
    assert.deepEqual(result.failures, [])
    assert.deepEqual(result.verified, [
      "double-refuses-text",
      "label-refuses-a-number",
    ])
  })

  it("leaves the working tree as it was, faults and all", async () => {
    const root = repo({
      ...fixture("double-refuses-text", doubleFault),
      ...fixture("label-refuses-a-number", labelFault),
    })
    const before = snapshot(root)
    await verify(root)
    assert.deepEqual(snapshot(root), before)
  })

  it("fails a fault that leaves the trap standing, naming the line", async () => {
    const root = repo({
      // Changes the body, not the type: the call is still an error.
      ...fixture("double-refuses-text", {
        file: "src/index.ts",
        search: "return n * 2",
        replace: "return n * 3",
      }),
      ...fixture("label-refuses-a-number", labelFault),
    })
    const result = await verify(root)
    const about = mentions(result, "double-refuses-text")
    assert.equal(about.length, 1, result.failures.join("\n"))
    assert.match(
      about[0],
      /does not remove the trap: tests\/traps\.test-d\.ts:4 still errors/
    )
    assert.deepEqual(result.verified, ["label-refuses-a-number"])
  })

  it("fails a fault that removes a different trap too", async () => {
    const root = repo({
      // Widens both functions: it removes the trap it is not the fault of.
      ...fixture("double-refuses-text", {
        edits: [...doubleEdits, ...labelEdits],
      }),
      ...fixture("label-refuses-a-number", labelFault),
    })
    const result = await verify(root)
    const about = mentions(result, "double-refuses-text")
    assert.equal(about.length, 1, result.failures.join("\n"))
    assert.match(
      about[0],
      /also removes the trap at tests\/traps\.test-d\.ts:8, which is tagged with another id/
    )
  })

  it("fails a fault that breaks more than its trap", async () => {
    const root = repo({
      ...fixture("double-refuses-text", {
        edits: [
          ...doubleEdits,
          {
            file: "src/index.ts",
            search: "return text.length",
            replace: "return text.size",
          },
        ],
      }),
      ...fixture("label-refuses-a-number", labelFault),
    })
    const result = await verify(root)
    const about = mentions(result, "double-refuses-text")
    assert.equal(about.length, 1, result.failures.join("\n"))
    assert.match(about[0], /breaks more than its trap/)
    assert.match(about[0], /src\/index\.ts:\d+:\d+ TS2339/)
  })

  it("fails a trap that has no fixture, naming the file to write", async () => {
    const root = repo({ ...fixture("double-refuses-text", doubleFault) })
    const result = await verify(root)
    const about = mentions(result, "label-refuses-a-number")
    assert.equal(about.length, 1, result.failures.join("\n"))
    assert.match(
      about[0],
      /no fault fixture\. Write scripts\/traps\/label-refuses-a-number\.json/
    )
  })

  it("fails a fixture that no trap uses", async () => {
    const root = repo({
      ...fixture("double-refuses-text", doubleFault),
      ...fixture("label-refuses-a-number", labelFault),
      ...fixture("long-gone", labelFault),
    })
    const result = await verify(root)
    assert.equal(
      mentions(result, "long-gone").length,
      1,
      result.failures.join("\n")
    )
    assert.match(mentions(result, "long-gone")[0], /a trap no traps file tags/)
  })

  it("fails a fault whose target has moved", async () => {
    const root = repo({
      ...fixture("double-refuses-text", {
        file: "src/index.ts",
        search: "export function twice(n: number): number",
        replace: "export function twice(n: number | string): number",
      }),
      ...fixture("label-refuses-a-number", labelFault),
    })
    const result = await verify(root)
    const about = mentions(result, "double-refuses-text")
    assert.equal(about.length, 1, result.failures.join("\n"))
    assert.match(about[0], /no longer contains .*twice.*update the fault/)
  })

  it("fails a fault whose search matches in two places", async () => {
    const root = repo({
      ...fixture("double-refuses-text", {
        file: "src/index.ts",
        search: "n",
        replace: "m",
      }),
      ...fixture("label-refuses-a-number", labelFault),
    })
    const result = await verify(root)
    assert.match(
      mentions(result, "double-refuses-text")[0],
      /times; make the search longer/
    )
  })

  it("fails a trap file that does not compile as it stands", async () => {
    const root = repo({
      "packages/demo/tests/traps.test-d.ts": `${TRAPS}\nlabel(true, "yes", 3)\n`,
      ...fixture("double-refuses-text", doubleFault),
      ...fixture("label-refuses-a-number", labelFault),
    })
    const result = await verify(root)
    assert.equal(result.failures.length, 1, result.failures.join("\n"))
    assert.match(result.failures[0], /does not compile as it stands/)
  })

  it("fails an untagged @ts-expect-error", async () => {
    const root = repo({
      "packages/demo/tests/traps.test-d.ts": `${TRAPS}\n// @ts-expect-error nobody proves this\nlabel(1)\n`,
      ...fixture("double-refuses-text", doubleFault),
      ...fixture("label-refuses-a-number", labelFault),
    })
    const result = await verify(root)
    assert.ok(
      mentions(result, 'has no "// trap: <id>" tag').length === 1,
      result.failures.join("\n")
    )
  })

  it("applies a fault written as a module", async () => {
    const root = repo({
      "scripts/traps/double-refuses-text.mjs": `export default ({ applyEdits }) => applyEdits(${jsLiteral(doubleEdits)})\n`,
      ...fixture("label-refuses-a-number", labelFault),
    })
    const result = await verify(root)
    assert.deepEqual(result.failures, [])
    assert.deepEqual(result.verified, [
      "double-refuses-text",
      "label-refuses-a-number",
    ])
  })

  it("checks one trap with `only`", async () => {
    const root = repo({
      ...fixture("double-refuses-text", doubleFault),
      ...fixture("label-refuses-a-number", labelFault),
    })
    const result = await verify(root, { only: "label-refuses-a-number" })
    assert.deepEqual(result.verified, ["label-refuses-a-number"])
  })
})
