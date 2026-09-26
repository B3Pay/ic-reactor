import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { runCanisterPipeline } from "./pipeline.js"
import { REACTOR_CLASS_NAMES } from "./validate.js"

// These tests compile generated files against the runtime packages they
// import, as this workspace builds them, so those packages' `dist` must exist.
// CI runs `pnpm build` before `pnpm test`.
const packagesDir = fileURLToPath(new URL("../..", import.meta.url))

/**
 * Motoko's `List<Int>`, as Candid spells it. For a recursive type like this
 * one, TypeScript could not infer the hooks of a reactor class from
 * @ic-reactor/candid, and the generated file failed with TS2589.
 */
const MOTOKO_LIST_DID = `type List = opt record { int; List };

service : {
  get : () -> (List) query;
  set : (List) -> (List);
}
`

/**
 * Types the declarations cannot export under their Candid names: `_SERVICE`,
 * next to the declarations' own `_SERVICE` interface, and `string`, a
 * TypeScript type keyword. The reactor was typed against the Candid `text`
 * (`string`), or against an interface merged with a Candid record.
 */
const RESERVED_NAMES_DID = `type _SERVICE = text;
type string = record { value : text };
type Account = record { owner : principal; name : string };

service : {
  get : () -> (_SERVICE) query;
  put : (string) -> (Account);
}
`

/**
 * A counter with a query taking no arguments, one taking arguments, and an
 * update method, whose `nat` a DisplayReactor types as a string and a Reactor
 * as a bigint.
 */
const COUNTER_DID = `service : {
  get : () -> (nat) query;
  get_owner : (nat) -> (opt principal) composite_query;
  add : (nat) -> (nat);
  reset : () -> () oneway;
}
`

/**
 * Method names whose factories need the naming rule: ones that collide once in
 * camelCase, a reserved word, a leading digit, an empty name, names taken by
 * the factory imports and by the canister's hooks, and non-ASCII letters.
 */
const NAMING_DID = `service : {
  "get_thing" : () -> (text) query;
  "getThing" : () -> (text) query;
  "get-thing" : (nat) -> (text) query;
  "if" : () -> (text) query;
  "delete" : (nat) -> ();
  "2fa_status" : () -> (bool) query;
  "" : () -> (text) query;
  "create" : (text) -> (nat);
  "Create" : () -> (nat) query;
  "create_query_factory" : (nat) -> (nat) query;
  "use_naming" : () -> (nat) query;
  "use_naming_suspense" : () -> (nat);
  "日本" : () -> (text) query;
  "__proto__" : () -> (text) query;
}
`

describe("generated files", () => {
  let project = ""

  function link(name: string, target: string) {
    const linkPath = path.join(project, "node_modules", name)
    fs.mkdirSync(path.dirname(linkPath), { recursive: true })
    fs.symlinkSync(target, linkPath, "junction")
  }

  beforeAll(() => {
    project = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "ic-reactor-codegen-types-"))
    )
    link("@ic-reactor/core", path.join(packagesDir, "core"))
    link("@ic-reactor/react", path.join(packagesDir, "react"))
    link("@ic-reactor/candid", path.join(packagesDir, "candid"))
    link(
      "@icp-sdk/core",
      fs.realpathSync(
        path.join(packagesDir, "core", "node_modules", "@icp-sdk", "core")
      )
    )

    fs.mkdirSync(path.join(project, "src"))
    fs.writeFileSync(
      path.join(project, "src", "clients.ts"),
      `import type { ClientManager } from "@ic-reactor/core"\n\nexport declare const clientManager: ClientManager\n`
    )
    fs.writeFileSync(path.join(project, "list.did"), MOTOKO_LIST_DID)
    fs.writeFileSync(path.join(project, "reserved.did"), RESERVED_NAMES_DID)
    fs.writeFileSync(path.join(project, "counter.did"), COUNTER_DID)
    fs.writeFileSync(path.join(project, "naming.did"), NAMING_DID)
  })

  afterAll(() => {
    fs.rmSync(project, { recursive: true, force: true })
  })

  it("compile with the React hooks of every reactor class for a recursive type", async () => {
    const entries: string[] = []

    for (const mode of REACTOR_CLASS_NAMES) {
      const outDir = path.join("src", mode)
      const result = await runCanisterPipeline({
        canisterConfig: { name: "list", didFile: "list.did", mode, outDir },
        projectRoot: project,
        globalConfig: { outDir: "src", clientManagerPath: "../clients" },
      })

      expect(result.error).toBeUndefined()
      entries.push(path.join(project, outDir, "index.ts"))
    }

    expect(typeErrors(entries)).toEqual([])
  }, 120_000)

  it("type a reactor by the service when the .did declares types named _SERVICE or string", async () => {
    const outDir = path.join("src", "reserved")
    const result = await runCanisterPipeline({
      canisterConfig: {
        name: "reserved",
        didFile: "reserved.did",
        mode: "Reactor",
        outDir,
      },
      projectRoot: project,
      globalConfig: { outDir: "src", clientManagerPath: "../clients" },
    })
    expect(result.error).toBeUndefined()

    const caller = path.join(project, "src", "reserved-caller.ts")
    fs.writeFileSync(
      caller,
      `import type { Principal } from "@icp-sdk/core/principal"
import { reservedReactor } from "./reserved"
import type { _SERVICE_, string_ } from "./reserved/declarations/reserved"

declare const owner: Principal
const text: string_ = { value: "text" }

export const got: Promise<_SERVICE_> = reservedReactor.callMethod({
  functionName: "get",
})
export const put: Promise<{ owner: Principal; name: string_ }> =
  reservedReactor.callMethod({ functionName: "put", args: [text] })
export const name: string_ = { value: owner.toText() }
`
    )

    expect(typeErrors([caller])).toEqual([])
  }, 120_000)

  it("compile the factories of every reactor class for a recursive type", async () => {
    const entries: string[] = []

    for (const mode of REACTOR_CLASS_NAMES) {
      const outDir = path.join("src", `${mode}-factories`)
      const result = await runCanisterPipeline({
        canisterConfig: {
          name: "list",
          didFile: "list.did",
          mode,
          outDir,
          factories: true,
        },
        projectRoot: project,
        globalConfig: { outDir: "src", clientManagerPath: "../clients" },
      })

      expect(result.error).toBeUndefined()
      expect(result.warnings).toBeUndefined()
      // The wrapper re-exports it, so compiling the wrapper compiles it.
      expect(
        fs.readFileSync(
          path.join(project, outDir, "index.factories.generated.ts"),
          "utf-8"
        )
      ).toContain("export const getQuery = ")
      entries.push(path.join(project, outDir, "index.ts"))
    }

    expect(typeErrors(entries, STRICTEST)).toEqual([])
  }, 120_000)

  it("type the factories by the reactor's transform, and generate no query for an update method", async () => {
    for (const [mode, outDir] of [
      ["DisplayReactor", "src/counter-display"],
      ["Reactor", "src/counter-raw"],
    ] as const) {
      const result = await runCanisterPipeline({
        canisterConfig: {
          name: "counter",
          didFile: "counter.did",
          mode,
          outDir,
          factories: true,
        },
        projectRoot: project,
        globalConfig: { outDir: "src", clientManagerPath: "../clients" },
      })
      expect(result.error).toBeUndefined()
    }

    const caller = path.join(project, "src", "counter-caller.ts")
    fs.writeFileSync(
      caller,
      `import type { Principal } from "@icp-sdk/core/principal"
import * as display from "./counter-display"
import * as raw from "./counter-raw"

// A DisplayReactor reads and sends a nat as a string, a Reactor as a bigint.
export const displayCount: Promise<string> = display.getQuery.fetch()
export const rawCount: Promise<bigint> = raw.getQuery.fetch()
export const displayOwner: Promise<string | null> = display
  .getOwnerQuery(["1"])
  .fetch()
export const rawOwner: Promise<[] | [Principal]> = raw.getOwnerQuery([1n]).fetch()
export const displayAdded: Promise<string> = display.addMutation.execute(["1"])
export const rawAdded: Promise<bigint> = raw.addMutation.execute([1n])
export const reset: Promise<undefined> = raw.resetMutation.execute([])

// @ts-expect-error A Reactor sends a nat as a bigint.
raw.addMutation.execute(["1"])
// @ts-expect-error A query factory takes the method's arguments.
display.getOwnerQuery([])

// An update or oneway method is a mutation, never a query.
// @ts-expect-error No query is generated for an update method.
export { addQuery } from "./counter-display"
// @ts-expect-error No query is generated for a oneway method.
export { resetQuery } from "./counter-display"
// @ts-expect-error A mutation has no useQuery.
display.addMutation.useQuery
// The reactor and the hooks are still exported from the same entry point.
export { counterReactor, useCounterQuery } from "./counter-display"
`
    )

    expect(typeErrors([caller], STRICTEST)).toEqual([])
  }, 120_000)

  it("compile factories for method names that collide, are reserved or are not ASCII", async () => {
    const outDir = path.join("src", "naming")
    const result = await runCanisterPipeline({
      canisterConfig: {
        name: "naming",
        didFile: "naming.did",
        mode: "Reactor",
        outDir,
        factories: true,
      },
      projectRoot: project,
      globalConfig: { outDir: "src", clientManagerPath: "../clients" },
    })
    expect(result.error).toBeUndefined()

    const caller = path.join(project, "src", "naming-caller.ts")
    fs.writeFileSync(
      caller,
      `import {
  Query,
  _2faStatusQuery,
  createMutation,
  createQuery,
  createQueryFactoryQuery,
  deleteMutation,
  getThingQuery,
  getThingQuery_,
  getThingQuery__,
  ifQuery,
  protoQuery,
  useNamingQuery,
  useNamingQuery_,
  useNamingSuspenseMutation,
  useNamingSuspenseQuery,
  日本Query,
} from "./naming"

// The entry point re-exports the reactor file and the factories, and
// TypeScript would reject a name both export (TS2308).
export const texts: Promise<string>[] = [
  Query.fetch(),
  getThingQuery([1n]).fetch(), // "get-thing" takes a nat
  getThingQuery_.fetch(), // "getThing"
  getThingQuery__.fetch(), // "get_thing"
  ifQuery.fetch(),
  protoQuery.fetch(),
  日本Query.fetch(),
]
export const status: Promise<boolean> = _2faStatusQuery.fetch()
export const created: Promise<bigint> = createMutation.execute(["post"])
export const count: Promise<bigint> = createQuery.fetch() // "Create"
export const factory: Promise<bigint> = createQueryFactoryQuery([1n]).fetch()
export const deleted: Promise<undefined> = deleteMutation.execute([1n])
export const own: Promise<bigint> = useNamingQuery_.fetch()
export const update: Promise<bigint> = useNamingSuspenseMutation.execute([])
// The canister's hooks keep their names.
export const hooks = [useNamingQuery, useNamingSuspenseQuery]
`
    )

    expect(typeErrors([caller], STRICTEST)).toEqual([])
  }, 120_000)

  /**
   * The settings a strict app compiles the generated files with. Each is one a
   * generated file could fail: an unused import, a type imported as a value,
   * a file that is not a module.
   */
  const STRICTEST: ts.CompilerOptions = {
    noUnusedLocals: true,
    noUnusedParameters: true,
    noImplicitReturns: true,
    noUncheckedIndexedAccess: true,
    exactOptionalPropertyTypes: true,
    isolatedModules: true,
    verbatimModuleSyntax: true,
  }

  /** TypeScript's errors for `entries` and every file they import. */
  function typeErrors(
    entries: string[],
    options: ts.CompilerOptions = {}
  ): string[] {
    const program = ts.createProgram(entries, {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      types: [],
      ...options,
    })
    return ts.getPreEmitDiagnostics(program).map((diagnostic) => {
      const where = diagnostic.file
        ? path.relative(project, diagnostic.file.fileName)
        : "(global)"
      return `${where}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`
    })
  }
})
