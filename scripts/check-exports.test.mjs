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
  collect,
  evaluate,
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
