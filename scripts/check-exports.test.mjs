/**
 * Tests of the export budget gate: what it must fail on, and that it reads
 * real declaration files the way the gate does.
 *
 * Run by `pnpm test:scripts`.
 */
import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { after, describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import {
  checkPackages,
  checkRepository,
  collect,
  declarationFilesOf,
  evaluate,
  exportsMapOf,
  isAlpha,
  readExportNames,
  typesFileOf,
} from "./check-exports.mjs"
import { ENTRIES, EXPORT_BUDGET } from "./export-budget.mjs"

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..")

const entry = (id) => ENTRIES.find((candidate) => candidate.id === id)
const CORE = entry("@ic-reactor/core")
const TESTING = entry("@ic-reactor/core/testing")
const REACT = entry("@ic-reactor/react")
const VITE = entry("@ic-reactor/vite-plugin")

/** What an entry exports, as `evaluate` takes it. */
const exporting = (budget, names, version = "4.0.0-alpha.0") => ({
  id: budget.id,
  version,
  names: new Map(names.map((name) => [name, "value"])),
})

/** Every planned name of every entry exported, and nothing else. */
const complete = (version) => [
  exporting(CORE, CORE.planned, version),
  exporting(TESTING, TESTING.planned, version),
  exporting(REACT, REACT.planned, version),
  exporting(VITE, VITE.planned, version),
]

const NO_FOREIGN = new Map()

const run = (exported, foreign = NO_FOREIGN) =>
  evaluate({ entries: ENTRIES, exported, foreign })

/** The failures that mention `text`. */
const failuresAbout = (result, text) =>
  result.failures.filter((failure) => failure.includes(text))

describe("the budget", () => {
  it("is the planned surface: core 13, testing 2, react 4 of 5, vite-plugin 2", () => {
    assert.deepEqual(
      ENTRIES.map(({ id, cap, planned }) => [id, cap, planned.length]),
      [
        ["@ic-reactor/core", 13, 13],
        ["@ic-reactor/core/testing", 2, 2],
        ["@ic-reactor/react", 5, 4],
        ["@ic-reactor/vite-plugin", 2, 2],
      ]
    )
  })

  it("passes when every planned name is exported", () => {
    const result = run(complete("4.0.0-beta.1"))
    assert.deepEqual(result.failures, [])
  })
})

describe("an entry that exports too much", () => {
  it("fails on a 14th core export", () => {
    const result = run([
      exporting(CORE, [...CORE.planned, "createStore"]),
      ...complete().slice(1),
    ])
    assert.equal(
      failuresAbout(result, "over its cap of 13").length,
      1,
      result.failures.join("\n")
    )
    assert.equal(failuresAbout(result, '"createStore"').length, 1)
  })

  it("fails on a name the plan does not have even when the cap is not reached", () => {
    const result = run([
      exporting(CORE, [...CORE.planned.slice(0, 5), "createStore"]),
      ...complete().slice(1),
    ])
    assert.equal(failuresAbout(result, '"createStore"').length, 1)
    assert.equal(failuresAbout(result, "over its cap").length, 0)
  })

  it("fails on react's fifth name until the plan names it, though the cap has room", () => {
    const result = run([
      ...complete().slice(0, 2),
      exporting(REACT, [...REACT.planned, "useCanister"]),
      exporting(VITE, VITE.planned),
    ])
    assert.equal(failuresAbout(result, '"useCanister"').length, 1)
    assert.equal(failuresAbout(result, "over its cap").length, 0)
  })

  it("counts a name that is a value and a type once", () => {
    const names = new Map(CORE.planned.map((name) => [name, "value and type"]))
    const result = run([
      { id: CORE.id, version: "4.0.0-alpha.0", names },
      ...complete().slice(1),
    ])
    assert.deepEqual(result.failures, [])
  })
})

describe("D35: one import path per name", () => {
  /** What the libraries beside ours export, for the tests below. */
  const foreign = new Map([
    ["principal", ["@candid-core/schema"]],
    ["isPrincipal", ["@candid-core/schema"]],
    ["skipToken", ["@tanstack/query-core", "@tanstack/react-query"]],
    ["queryOptions", ["@tanstack/react-query"]],
  ])

  it("fails when core exports `principal`", () => {
    const result = run(
      [exporting(CORE, [...CORE.planned, "principal"]), ...complete().slice(1)],
      foreign
    )
    const about = failuresAbout(result, '"principal"')
    assert.ok(
      about.some((failure) =>
        failure.includes("@candid-core/schema also export")
      ),
      result.failures.join("\n")
    )
  })

  it("fails when core exports `skipToken`, naming both packages that have it", () => {
    const result = run(
      [exporting(CORE, [...CORE.planned, "skipToken"]), ...complete().slice(1)],
      foreign
    )
    assert.ok(
      failuresAbout(result, '"skipToken"').some(
        (failure) =>
          failure.includes("@tanstack/query-core") &&
          failure.includes("@tanstack/react-query")
      ),
      result.failures.join("\n")
    )
  })

  it("fails when react exports `queryOptions`", () => {
    const result = run(
      [
        ...complete().slice(0, 2),
        exporting(REACT, [...REACT.planned, "queryOptions"]),
        exporting(VITE, VITE.planned),
      ],
      foreign
    )
    assert.ok(failuresAbout(result, '"queryOptions"').length >= 1)
  })

  it("fails when two entries export the same name", () => {
    const result = run([
      exporting(CORE, CORE.planned),
      exporting(TESTING, [...TESTING.planned, "Network"]),
      ...complete().slice(2),
    ])
    assert.ok(
      failuresAbout(
        result,
        '"Network" is exported by @ic-reactor/core and @ic-reactor/core/testing'
      ).length === 1,
      result.failures.join("\n")
    )
  })

  it("fails a planned name that a library exports, once it is exported too", () => {
    // The plan cannot excuse it: D35 does not read the plan.
    const planned = [...CORE.planned.slice(0, 12), "principal"]
    const entries = ENTRIES.map((budget) =>
      budget === CORE ? { ...CORE, planned } : budget
    )
    const result = evaluate({
      entries,
      exported: [exporting(CORE, planned), ...complete().slice(1)],
      foreign,
    })
    assert.equal(result.failures.length, 1, result.failures.join("\n"))
    assert.match(
      result.failures[0],
      /exports "principal", which @candid-core\/schema also exports/
    )
  })

  it("fails when the plan itself names something a library exports", () => {
    const entries = ENTRIES.map((budget) =>
      budget === VITE
        ? { ...VITE, planned: [...VITE.planned.slice(0, 1), "principal"] }
        : budget
    )
    const result = evaluate({ entries, exported: [], foreign })
    assert.equal(failuresAbout(result, "plans to export").length, 1)
  })

  it("fails when the plan names one thing for two entries", () => {
    const entries = ENTRIES.map((budget) =>
      budget === REACT
        ? { ...REACT, planned: [...REACT.planned, "Network"] }
        : budget
    )
    const result = evaluate({ entries, exported: [], foreign: NO_FOREIGN })
    assert.equal(failuresAbout(result, 'plans "Network" for').length, 1)
  })

  it("is satisfied by the real plan against the real libraries", () => {
    const { foreign: real, failures } = collect({
      rootDir: repoRoot,
      budget: { entries: [], foreign: EXPORT_BUDGET.foreign },
    })
    assert.deepEqual(failures, [])
    // The reference list is populated from the installed declarations.
    assert.deepEqual(real.get("principal"), ["@candid-core/schema"])
    assert.deepEqual(real.get("validate"), ["@candid-core/schema/validate"])
    assert.ok(real.get("skipToken")?.includes("@tanstack/query-core"))
    assert.ok(real.get("queryOptions")?.includes("@tanstack/react-query"))
    assert.ok(real.get("useQuery")?.includes("@tanstack/react-query"))

    const result = evaluate({ entries: ENTRIES, exported: [], foreign: real })
    assert.deepEqual(result.failures, [])
  })
})

describe("planned names that are not exported yet", () => {
  it("are pending while the version is an alpha", () => {
    const result = run([
      exporting(CORE, ["isReactorError"]),
      exporting(TESTING, []),
      exporting(REACT, []),
      exporting(VITE, VITE.planned),
    ])
    assert.deepEqual(result.failures, [])
    assert.ok(result.pending.get(CORE.id).includes("createClient"))
    assert.deepEqual(result.pending.get(REACT.id), REACT.planned)
    assert.equal(result.pending.has(VITE.id), false)
  })

  for (const version of ["4.0.0-beta.1", "4.0.0-rc.0", "4.0.0"]) {
    it(`fail at ${version}`, () => {
      const result = run([
        exporting(CORE, ["isReactorError"], version),
        ...complete(version).slice(1),
      ])
      assert.equal(failuresAbout(result, "does not export").length, 1)
      assert.ok(failuresAbout(result, "createClient").length >= 1)
    })
  }

  it("are only an alpha's allowance", () => {
    assert.equal(isAlpha("4.0.0-alpha.0"), true)
    assert.equal(isAlpha("4.0.0-alpha.12"), true)
    assert.equal(isAlpha("4.0.0-beta.1"), false)
    assert.equal(isAlpha("4.0.0"), false)
    assert.equal(isAlpha("4.0.0-alphabet.1"), false)
  })
})

describe("the transitional allowance", () => {
  it("lists what IR4a added and names IR4b as the slice that removes it", () => {
    assert.ok(TESTING.transitional.includes("createFakeReplica"))
    assert.ok(TESTING.transitional.includes("createTestAuth"))
    assert.ok(TESTING.transitional.includes("installFakeReplica"))
  })

  it("is allowed, and outside the cap, while the version is an alpha", () => {
    const result = run([
      exporting(CORE, CORE.planned),
      exporting(TESTING, [...TESTING.planned, ...TESTING.transitional]),
      exporting(REACT, REACT.planned),
      exporting(VITE, VITE.planned),
    ])
    assert.deepEqual(result.failures, [])
    assert.deepEqual(result.transitional.get(TESTING.id), TESTING.transitional)
  })

  it("fails from the first beta, naming IR4b", () => {
    const result = run([
      exporting(CORE, CORE.planned, "4.0.0-beta.1"),
      exporting(
        TESTING,
        [...TESTING.planned, "createFakeReplica"],
        "4.0.0-beta.1"
      ),
      exporting(REACT, REACT.planned, "4.0.0-beta.1"),
      exporting(VITE, VITE.planned, "4.0.0-beta.1"),
    ])
    const about = failuresAbout(result, "transitional")
    assert.equal(about.length, 1, result.failures.join("\n"))
    assert.match(about[0], /createFakeReplica/)
    assert.match(about[0], /IR4b \(#783\)/)
  })

  it("does not excuse a name it does not list", () => {
    const result = run([
      ...complete().slice(0, 1),
      exporting(TESTING, [...TESTING.planned, "createSomethingElse"]),
      ...complete().slice(2),
    ])
    assert.equal(failuresAbout(result, '"createSomethingElse"').length, 1)
  })
})

describe("reading declaration files", () => {
  const root = mkdtempSync(join(tmpdir(), "check-exports-test-"))
  after(() => rmSync(root, { recursive: true, force: true }))

  const write = (path, text) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }

  // A repository of its own: a core whose entry re-exports from another file,
  // and the schema package it must not overlap with.
  write(
    "packages/core/package.json",
    JSON.stringify({
      name: "@ic-reactor/core",
      version: "4.0.0-alpha.0",
      exports: {
        ".": { import: { types: "./dist/index.d.ts" } },
        "./testing": { types: "./dist/testing.d.ts" },
        // Mapped, but never built.
        "./ghost": { types: "./dist/ghost.d.ts" },
      },
    })
  )
  write(
    "packages/core/dist/index.d.ts",
    [
      `export * from "./units.js"`,
      `export type { Network } from "./network.js"`,
      `export { principal } from "./principal.js"`,
      `export declare const createClient: () => void`,
      `export interface Client { id: string }`,
      ``,
    ].join("\n")
  )
  write(
    "packages/core/dist/units.d.ts",
    `export declare function parseUnits(): bigint\nexport declare function formatUnits(): string\n`
  )
  write(
    "packages/core/dist/network.d.ts",
    `export type Network = "ic" | "local"\n`
  )
  write(
    "packages/core/dist/principal.d.ts",
    `export declare function principal(): string\n`
  )
  write("packages/core/dist/testing.d.ts", `export {}\n`)
  write(
    "node_modules/@candid-core/schema/package.json",
    JSON.stringify({
      name: "@candid-core/schema",
      version: "9.0.0",
      exports: { ".": { types: "./schema.d.ts" } },
    })
  )
  write(
    "node_modules/@candid-core/schema/schema.d.ts",
    `export declare function principal(text: string): string\nexport type Principal = string\n`
  )

  const budget = {
    entries: [
      {
        id: "@ic-reactor/core",
        package: "packages/core",
        subpath: ".",
        cap: 4,
        planned: ["createClient", "parseUnits", "formatUnits", "Client"],
      },
      {
        id: "@ic-reactor/core/testing",
        package: "packages/core",
        subpath: "./testing",
        cap: 1,
        planned: ["createTestClient"],
      },
    ],
    foreign: [
      {
        package: "@candid-core/schema",
        from: ".",
        pin: "9.0.0",
        subpaths: ["."],
      },
    ],
  }

  it("finds the declarations through the exports map's conditions", () => {
    assert.equal(
      typesFileOf(join(root, "packages/core"), "."),
      join(root, "packages/core/dist/index.d.ts")
    )
    assert.equal(
      typesFileOf(join(root, "packages/core"), "./testing"),
      join(root, "packages/core/dist/testing.d.ts")
    )
    assert.equal(
      typesFileOf(join(root, "packages/core"), "./missing"),
      undefined
    )
  })

  it("reads every name an entry exports, through `export *` and re-exports, with its kind", () => {
    const file = join(root, "packages/core/dist/index.d.ts")
    const names = readExportNames([file]).get(file)
    assert.deepEqual([...names.keys()].sort(), [
      "Client",
      "Network",
      "createClient",
      "formatUnits",
      "parseUnits",
      "principal",
    ])
    assert.equal(names.get("Network"), "type")
    assert.equal(names.get("createClient"), "value")
    assert.equal(names.get("principal"), "value")
  })

  it("fails an entry that exports `principal`, which the installed schema also exports", () => {
    const {
      exported,
      foreign,
      failures: unreadable,
    } = collect({ rootDir: root, budget })
    assert.deepEqual(unreadable, [])
    const result = evaluate({ entries: budget.entries, exported, foreign })
    assert.ok(
      failuresAbout(result, '"principal"').some((failure) =>
        failure.includes("@candid-core/schema")
      ),
      result.failures.join("\n")
    )
    assert.ok(
      failuresAbout(
        result,
        '"principal" (value), which the export budget does not plan'
      ).length === 1
    )
    assert.deepEqual(result.pending.get("@ic-reactor/core/testing"), [
      "createTestClient",
    ])
  })

  it("fails when the schema installed is not the one the budget is written against", () => {
    const { failures } = collect({
      rootDir: root,
      budget: {
        ...budget,
        foreign: [{ ...budget.foreign[0], pin: "9.0.1" }],
      },
    })
    assert.equal(failures.length, 1)
    assert.match(
      failures[0],
      /installed at 9\.0\.0, but the export budget is written against 9\.0\.1/
    )
  })

  it("reports a missing build, or a subpath with no declarations, instead of passing", () => {
    const { failures } = collect({
      rootDir: root,
      budget: {
        entries: [
          { ...budget.entries[0], subpath: "./ghost" },
          { ...budget.entries[0], id: "unmapped", subpath: "./nowhere" },
        ],
        foreign: [],
      },
    })
    assert.equal(failures.length, 2)
    assert.match(
      failures[0],
      /ghost\.d\.ts does not exist\. Run `pnpm build` first/
    )
    assert.match(failures[1], /has no declarations for "\.\/nowhere"/)
  })
})

// ── Every way in is budgeted ─────────────────────────────────────────────────

const repos = []
after(() => {
  for (const root of repos) rmSync(root, { recursive: true, force: true })
})

/** A repository of the given files, in a temporary directory. */
function makeRepo(files) {
  const root = mkdtempSync(join(tmpdir(), "check-exports-repo-"))
  repos.push(root)
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  return root
}

const manifest = (name, fields) =>
  JSON.stringify({ name, version: "4.0.0-alpha.0", ...fields })

describe("a subpath of `exports` that the budget has no entry for", () => {
  const rootDir = (extraCore = {}, extraReact = {}) =>
    makeRepo({
      "packages/core/package.json": manifest("@ic-reactor/core", {
        exports: {
          ".": { types: "./dist/index.d.ts" },
          "./testing": { types: "./dist/testing/index.d.ts" },
          "./package.json": "./package.json",
          ...extraCore,
        },
      }),
      "packages/react/package.json": manifest("@ic-reactor/react", {
        exports: { ".": { types: "./dist/index.d.ts" }, ...extraReact },
      }),
      "packages/vite-plugin/package.json": manifest("@ic-reactor/vite-plugin", {
        exports: {
          ".": {
            import: { types: "./dist/index.d.ts" },
            require: { types: "./dist/index.d.cts" },
          },
        },
      }),
    })
  const budget = { entries: ENTRIES, foreign: [] }
  const check = (root) => checkPackages({ rootDir: root, budget })

  it("passes when every subpath has an entry, and `./package.json` is exempt", () => {
    assert.deepEqual(check(rootDir()), [])
  })

  it("fails on a new core subpath, which would export what the entries do not", () => {
    const failures = check(
      rootDir({ "./internal": { types: "./dist/errors.d.ts" } })
    )
    assert.equal(failures.length, 1, failures.join("\n"))
    assert.match(
      failures[0],
      /packages\/core\/package\.json maps the subpath "\.\/internal", which the export budget has no entry for/
    )
  })

  it("fails on a react `./server` entry", () => {
    const failures = check(
      rootDir({}, { "./server": { types: "./dist/server.d.ts" } })
    )
    assert.equal(failures.length, 1, failures.join("\n"))
    assert.match(
      failures[0],
      /packages\/react\/package\.json maps.*"\.\/server"/
    )
  })

  it("fails on a wildcard subpath, which exposes every file it matches", () => {
    const failures = check(rootDir({ "./dist/*": "./dist/*.js" }))
    assert.equal(failures.length, 1)
    assert.match(failures[0], /"\.\/dist\/\*"/)
  })

  it("does not count a subpath mapped to null, which blocks it", () => {
    assert.deepEqual(check(rootDir({ "./internal": null })), [])
  })

  it("fails on a publishable package with no entry at all", () => {
    const root = makeRepo({
      "packages/core/package.json": manifest("@ic-reactor/core", {
        exports: { ".": "./dist/index.js" },
      }),
      "packages/cli/package.json": manifest("@ic-reactor/cli", {
        exports: { ".": "./dist/index.js" },
      }),
    })
    const failures = checkPackages({
      rootDir: root,
      budget: { entries: [ENTRIES[0]], foreign: [] },
    })
    assert.equal(failures.length, 1, failures.join("\n"))
    assert.match(
      failures[0],
      /packages\/cli \(@ic-reactor\/cli\) is publishable but has no entry in the export budget/
    )
  })

  it("skips a private package", () => {
    const root = makeRepo({
      "packages/core/package.json": manifest("@ic-reactor/core", {
        exports: { ".": "./dist/index.js" },
      }),
      "packages/tools/package.json": manifest("tools", {
        private: true,
        exports: { ".": "./index.js", "./anything": "./anything.js" },
      }),
    })
    assert.deepEqual(
      checkPackages({
        rootDir: root,
        budget: { entries: [ENTRIES[0]], foreign: [] },
      }),
      []
    )
  })

  it("fails on a package with no `exports` map, where every file is importable", () => {
    const root = makeRepo({
      "packages/core/package.json": manifest("@ic-reactor/core", {
        types: "./dist/index.d.ts",
      }),
    })
    const failures = checkPackages({
      rootDir: root,
      budget: { entries: [ENTRIES[0]], foreign: [] },
    })
    assert.equal(failures.length, 1)
    assert.match(failures[0], /has no `exports` map/)
  })

  it("holds for the real packages", () => {
    assert.deepEqual(checkPackages({ rootDir: repoRoot }), [])
  })
})

describe("reading an `exports` map", () => {
  it("takes the sugar forms as the root subpath", () => {
    assert.deepEqual(exportsMapOf({ exports: "./index.js" }), {
      ".": "./index.js",
    })
    assert.deepEqual(
      exportsMapOf({ exports: { import: "./a.js", default: "./b.js" } }),
      { ".": { import: "./a.js", default: "./b.js" } }
    )
    assert.deepEqual(
      exportsMapOf({ exports: { ".": "./a.js", "./b": null } }),
      {
        ".": "./a.js",
        "./b": null,
      }
    )
    assert.equal(exportsMapOf({}), undefined)
  })
})

describe("the conditions of one entry", () => {
  const plugin = (declarations) => ({
    "packages/plugin/package.json": manifest("@ic-reactor/plugin", {
      exports: {
        ".": {
          import: { types: "./dist/index.d.ts", default: "./dist/index.js" },
          require: { types: "./dist/index.d.cts", default: "./dist/index.cjs" },
        },
      },
    }),
    "packages/plugin/dist/index.d.ts": `export declare const icReactor: () => void\nexport interface Options { a: string }\n`,
    ...declarations,
  })
  const budget = {
    entries: [
      {
        id: "@ic-reactor/plugin",
        package: "packages/plugin",
        subpath: ".",
        cap: 2,
        planned: ["icReactor", "Options"],
      },
    ],
    foreign: [],
  }
  const check = (files) => checkRepository({ rootDir: makeRepo(files), budget })

  it("passes when `require` declares the names `import` does", () => {
    const result = check(
      plugin({
        "packages/plugin/dist/index.d.cts": `export declare const icReactor: () => void\nexport interface Options { a: string }\n`,
      })
    )
    assert.deepEqual(result.failures, [])
  })

  it("fails when `require` declares a name `import` does not", () => {
    const result = check(
      plugin({
        "packages/plugin/dist/index.d.cts": `export declare const icReactor: () => void\nexport interface Options { a: string }\nexport declare const leak: () => void\n`,
      })
    )
    assert.equal(result.failures.length, 1, result.failures.join("\n"))
    assert.match(
      result.failures[0],
      /the "require\.types" condition \(packages\/plugin\/dist\/index\.d\.cts\).*only there: leak/
    )
  })

  it("fails when `require` lacks a name `import` declares", () => {
    const result = check(
      plugin({
        "packages/plugin/dist/index.d.cts": `export declare const icReactor: () => void\n`,
      })
    )
    assert.equal(result.failures.length, 1, result.failures.join("\n"))
    assert.match(result.failures[0], /missing there: Options/)
  })

  it("fails when a declared branch was never built", () => {
    const result = check(plugin({}))
    assert.equal(result.failures.length, 1, result.failures.join("\n"))
    assert.match(
      result.failures[0],
      /the "require\.types" condition declares .*index\.d\.cts, which does not exist/
    )
  })

  it("fails on a JavaScript-only condition placed before `types` that declares more", () => {
    // A bundler or `customConditions` project that sets `development` loads
    // dist/dev.js, and TypeScript types that import from dist/dev.d.ts.
    const files = plugin({
      "packages/plugin/dist/dev.d.ts": `export declare const icReactor: () => void\nexport interface Options { a: string }\nexport declare const leak: () => void\n`,
    })
    // `types` is a sibling of `development` here, as in a flat map: an object
    // that names `types` is no reason to skip the conditions ahead of it.
    files["packages/plugin/package.json"] = manifest("@ic-reactor/plugin", {
      exports: {
        ".": {
          development: "./dist/dev.js",
          types: "./dist/index.d.ts",
          import: "./dist/index.js",
          default: "./dist/index.js",
        },
      },
    })
    const result = check(files)
    assert.equal(result.failures.length, 1, result.failures.join("\n"))
    assert.match(
      result.failures[0],
      /the "development" condition \(packages\/plugin\/dist\/dev\.d\.ts\).*only there: leak/
    )
  })

  it("passes a JavaScript-only condition before `types` that declares the same names", () => {
    const files = plugin({
      "packages/plugin/dist/dev.d.ts": `export declare const icReactor: () => void\nexport interface Options { a: string }\n`,
    })
    files["packages/plugin/package.json"] = manifest("@ic-reactor/plugin", {
      exports: {
        ".": {
          development: "./dist/dev.js",
          types: "./dist/index.d.ts",
          import: "./dist/index.js",
        },
      },
    })
    assert.deepEqual(check(files).failures, [])
  })

  it("is part of the gate, together with the unbudgeted subpaths", () => {
    const files = plugin({
      "packages/plugin/dist/index.d.cts": `export declare const icReactor: () => void\nexport declare const leak: () => void\n`,
    })
    files["packages/plugin/package.json"] = manifest("@ic-reactor/plugin", {
      exports: {
        ".": {
          import: { types: "./dist/index.d.ts" },
          require: { types: "./dist/index.d.cts" },
        },
        "./internal": { types: "./dist/index.d.ts" },
      },
    })
    const result = check(files)
    assert.equal(
      result.failures.filter((failure) => failure.includes("./internal"))
        .length,
      1,
      result.failures.join("\n")
    )
    assert.equal(
      result.failures.filter((failure) => failure.includes("only there: leak"))
        .length,
      1
    )
  })

  describe("declarationFilesOf", () => {
    const filesOf = (exportsMap, extra = {}) => {
      const root = makeRepo({
        "packages/p/package.json": manifest("p", { exports: exportsMap }),
        ...extra,
      })
      return declarationFilesOf(join(root, "packages/p"), ".").map(
        ({ file, via }) => [file.slice(file.indexOf("packages/p/") + 11), via]
      )
    }

    it("lists every declaration the conditions lead to, with the condition path", () => {
      assert.deepEqual(
        filesOf({
          ".": {
            import: { types: "./dist/index.d.ts", default: "./dist/index.js" },
            require: { types: "./dist/index.d.cts" },
          },
        }),
        [
          ["dist/index.d.ts", "import.types"],
          ["dist/index.d.cts", "require.types"],
        ]
      )
    })

    it("reads the declaration beside a JavaScript target that no `types` precedes", () => {
      assert.deepEqual(
        filesOf(
          { ".": { import: "./dist/index.js", require: "./dist/index.cjs" } },
          {
            "packages/p/dist/index.d.ts": "export {}\n",
            "packages/p/dist/index.d.cts": "export {}\n",
          }
        ),
        [
          ["dist/index.d.ts", "import"],
          ["dist/index.d.cts", "require"],
        ]
      )
    })

    it("reads no sibling past a `types` that comes first, as TypeScript never gets past it", () => {
      assert.deepEqual(
        filesOf(
          { ".": { types: "./dist/types.d.ts", import: "./dist/index.js" } },
          { "packages/p/dist/index.d.ts": "export {}\n" }
        ),
        [["dist/types.d.ts", "types"]]
      )
    })

    it("reads no sibling inside an object that comes after `types`", () => {
      assert.deepEqual(
        filesOf(
          {
            ".": {
              types: "./dist/types.d.ts",
              node: { import: "./dist/index.js" },
            },
          },
          { "packages/p/dist/index.d.ts": "export {}\n" }
        ),
        [["dist/types.d.ts", "types"]]
      )
    })

    // Conditions are tried in key order, so a JavaScript-only condition ahead
    // of `types` wins for a project that sets it (`customConditions`, or a
    // bundler's `development` and `react-server`), and loads that file.
    it("reads the sibling of a JavaScript condition placed before `types`", () => {
      assert.deepEqual(
        filesOf(
          {
            ".": {
              development: "./dist/dev.js",
              types: "./dist/types.d.ts",
              import: "./dist/index.js",
            },
          },
          {
            "packages/p/dist/dev.d.ts": "export {}\n",
            "packages/p/dist/index.d.ts": "export {}\n",
          }
        ),
        [
          ["dist/dev.d.ts", "development"],
          ["dist/types.d.ts", "types"],
        ]
      )
    })

    it("reads the sibling of a JavaScript condition before `types` in a nested object", () => {
      assert.deepEqual(
        filesOf(
          {
            ".": {
              import: {
                "react-server": "./dist/server.js",
                types: "./dist/types.d.ts",
                default: "./dist/index.js",
              },
            },
          },
          {
            "packages/p/dist/server.d.ts": "export {}\n",
            "packages/p/dist/index.d.ts": "export {}\n",
          }
        ),
        [
          ["dist/server.d.ts", "import.react-server"],
          ["dist/types.d.ts", "import.types"],
        ]
      )
    })

    it("keeps the sibling out when `types` comes first and a JavaScript condition after it", () => {
      // The v3 shape of `@ic-reactor/react`: `types` first, then the
      // `react-server` build, whose declaration TypeScript never reads.
      assert.deepEqual(
        filesOf(
          {
            ".": {
              types: "./dist/types.d.ts",
              "react-server": "./dist/server.js",
              import: "./dist/index.js",
            },
          },
          { "packages/p/dist/server.d.ts": "export {}\n" }
        ),
        [["dist/types.d.ts", "types"]]
      )
    })
  })
})

describe("the version of the schema that packages declare", () => {
  const schema = {
    "node_modules/@candid-core/schema/package.json": JSON.stringify({
      name: "@candid-core/schema",
      version: "9.0.0",
      exports: { ".": { types: "./schema.d.ts" } },
    }),
    "node_modules/@candid-core/schema/schema.d.ts": `export type Principal = string\n`,
  }
  const budget = {
    entries: [],
    foreign: [
      {
        package: "@candid-core/schema",
        from: ".",
        pin: "9.0.0",
        subpaths: ["."],
      },
    ],
  }
  const check = (manifests) => {
    const files = { ...schema }
    for (const [path, fields] of Object.entries(manifests)) {
      files[path] = manifest("some-package", fields)
    }
    return collect({ rootDir: makeRepo(files), budget }).failures
  }

  it("passes when every manifest declares the pinned version", () => {
    assert.deepEqual(
      check({
        "package.json": { devDependencies: { "@candid-core/schema": "9.0.0" } },
        "packages/core/package.json": {
          dependencies: { "@candid-core/schema": "9.0.0" },
        },
      }),
      []
    )
  })

  it("fails when a package declares another version than the root installs", () => {
    // The install the check reads is the root's, which is still at the pin:
    // without this check core could move on and nothing would notice.
    const failures = check({
      "package.json": { devDependencies: { "@candid-core/schema": "9.0.0" } },
      "packages/core/package.json": {
        dependencies: { "@candid-core/schema": "9.0.1" },
      },
    })
    assert.equal(failures.length, 1, failures.join("\n"))
    assert.match(
      failures[0],
      /packages\/core\/package\.json declares @candid-core\/schema "9\.0\.1" in dependencies, but the export budget is written against exactly 9\.0\.0/
    )
  })

  it("fails on a range, in any dependency field of any package", () => {
    const failures = check({
      "packages/react/package.json": {
        peerDependencies: { "@candid-core/schema": "^9.0.0" },
      },
    })
    assert.equal(failures.length, 1, failures.join("\n"))
    assert.match(
      failures[0],
      /packages\/react\/package\.json declares @candid-core\/schema "\^9\.0\.0" in peerDependencies/
    )
  })

  it("is satisfied by the real manifests", () => {
    const { failures } = collect({
      rootDir: repoRoot,
      budget: { entries: [], foreign: EXPORT_BUDGET.foreign },
    })
    assert.deepEqual(failures, [])
  })
})
