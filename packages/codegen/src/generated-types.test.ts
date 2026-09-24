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

  /** TypeScript's errors for `entries` and every file they import. */
  function typeErrors(entries: string[]): string[] {
    const program = ts.createProgram(entries, {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      types: [],
    })
    return ts.getPreEmitDiagnostics(program).map((diagnostic) => {
      const where = diagnostic.file
        ? path.relative(project, diagnostic.file.fileName)
        : "(global)"
      return `${where}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`
    })
  }
})
