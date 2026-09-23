import { describe, it, expect, afterEach } from "vitest"
import { didToJs, didToTs } from "@ic-reactor/parser"
import fs from "node:fs"
import { createRequire } from "node:module"
import os from "node:os"
import path from "node:path"
import { declarationsExist, generateDeclarations } from "./generators/index.js"

describe("Bindgen", () => {
  const canisterName = "test_canister"
  const validDidContent = `service : {
    greet: (text) -> (text) query;
}`
  const invalidDidContent = `service : {
    greet: (text) ->
}`

  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
    tempDirs.length = 0
  })

  // These tests run against a real temp directory rather than a mocked `fs`.
  // The generator stages its output and renames it into place, so which calls
  // it makes is an implementation detail; what matters is the state the
  // directory is left in — including after a failure.
  function createTempProject() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ic-reactor-bindgen-"))
    tempDirs.push(root)
    return root
  }

  function writeDid(root: string, name: string, content: string) {
    const didFile = path.join(root, name)
    fs.writeFileSync(didFile, content)
    return didFile
  }

  /** Every file under `dir`, as `relative path → contents`. */
  function snapshotTree(dir: string): Record<string, string> {
    const tree: Record<string, string> = {}
    for (const entry of fs.readdirSync(dir, {
      withFileTypes: true,
      recursive: true,
    })) {
      if (!entry.isFile()) continue
      const full = path.join(entry.parentPath, entry.name)
      tree[path.relative(dir, full)] = fs.readFileSync(full, "utf-8")
    }
    return tree
  }

  it("generateDeclarations creates correct files", async () => {
    const root = createTempProject()
    const didFile = writeDid(root, "test.did", validDidContent)
    const outDir = path.join(root, "output")

    const result = await generateDeclarations({
      didFile,
      outDir,
      canisterName,
    })

    if (!result.success) {
      console.error(result.error)
    }

    const declarationsDir = path.join(outDir, "declarations")

    expect(result.success).toBe(true)
    expect(result.declarationsDir).toBe(declarationsDir)

    const jsPath = path.join(declarationsDir, "test.js")
    const dtsPath = path.join(declarationsDir, "test.d.ts")
    const didCopyPath = path.join(declarationsDir, "test.did")

    expect(result.files.map((file) => file.filePath)).toEqual([
      jsPath,
      dtsPath,
      didCopyPath,
    ])
    expect(fs.readFileSync(didCopyPath, "utf-8")).toBe(validDidContent)

    expect(fs.readFileSync(jsPath, "utf-8")).toMatchSnapshot("js-declarations")
    expect(fs.readFileSync(dtsPath, "utf-8")).toMatchSnapshot("ts-declarations")
  })

  // Windows PowerShell's `Out-File -Encoding utf8` and editors set to "UTF-8
  // with BOM" start the file with EF BB BF. The parser rejected the mark as an
  // unknown token at 0..3, so generation failed.
  it("generates the same declarations from a .did that starts with a UTF-8 byte order mark", async () => {
    const root = createTempProject()
    const bomBytes = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from(validDidContent),
    ])
    const plainDir = path.join(root, "plain")
    const bomDir = path.join(root, "bom")
    fs.mkdirSync(plainDir)
    fs.mkdirSync(bomDir)
    fs.writeFileSync(path.join(plainDir, "test.did"), validDidContent)
    fs.writeFileSync(path.join(bomDir, "test.did"), bomBytes)

    const generate = (dir: string) =>
      generateDeclarations({
        didFile: path.join(dir, "test.did"),
        outDir: path.join(dir, "output"),
        canisterName,
      })
    const read = (dir: string, fileName: string) =>
      fs.readFileSync(path.join(dir, "output", "declarations", fileName))

    expect((await generate(plainDir)).success).toBe(true)
    const result = await generate(bomDir)

    expect(result.error).toBeUndefined()
    expect(result.success).toBe(true)
    expect(read(bomDir, "test.js")).toEqual(read(plainDir, "test.js"))
    expect(read(bomDir, "test.d.ts")).toEqual(read(plainDir, "test.d.ts"))
    // The .did copy is a byte copy of the source, mark included.
    expect(read(bomDir, "test.did")).toEqual(bomBytes)
  })

  it("returns error if DID file missing", async () => {
    const root = createTempProject()

    const result = await generateDeclarations({
      didFile: path.join(root, "missing.did"),
      outDir: path.join(root, "output"),
      canisterName,
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain("DID file not found")
  })

  it("leaves the previous declarations byte-identical when the .did no longer parses", async () => {
    const root = createTempProject()
    const didFile = writeDid(root, "test.did", validDidContent)
    const outDir = path.join(root, "output")
    const declarationsDir = path.join(outDir, "declarations")

    expect(
      (await generateDeclarations({ didFile, outDir, canisterName })).success
    ).toBe(true)

    const before = snapshotTree(declarationsDir)
    expect(Object.keys(before).sort()).toEqual([
      "test.d.ts",
      "test.did",
      "test.js",
    ])

    // The vite plugin re-runs this on every save, so a half-typed .did is a
    // normal watch-mode event, not an edge case.
    fs.writeFileSync(didFile, invalidDidContent)

    const failed = await generateDeclarations({ didFile, outDir, canisterName })

    expect(failed.success).toBe(false)
    expect(failed.error).toContain(canisterName)
    expect(snapshotTree(declarationsDir)).toEqual(before)

    // No staging directory is left behind for the next run to trip over.
    expect(
      fs
        .readdirSync(outDir)
        .filter((entry) => entry.startsWith(".declarations.tmp-"))
    ).toEqual([])
  })

  it("rejects a .did that declares no service", async () => {
    const root = createTempProject()
    const didFile = writeDid(
      root,
      "shared_types.did",
      "type Foo = record { a : nat };"
    )
    const outDir = path.join(root, "output")

    const result = await generateDeclarations({ didFile, outDir, canisterName })

    expect(result.success).toBe(false)
    expect(result.error).toContain(canisterName)
    expect(result.error).toContain(didFile)
    expect(result.error).toContain("produces no idlFactory")
    expect(fs.existsSync(path.join(outDir, "declarations"))).toBe(false)
  })

  // The service-detection gate tests the GENERATED OUTPUT, not
  // `parseDid(...).service`. That AST field is populated only for an inline
  // body and is null for every alias form below, all of which the parser
  // compiles to a complete idlFactory. An earlier version of this gate read the
  // AST field and rejected these valid files outright.
  it.each([
    [
      "service : S",
      "type Ledger = service { balance_of : (nat) -> (nat) query; };\nservice : Ledger;",
    ],
    [
      "service : (args) -> S",
      "type S = service { f : () -> (nat); };\nservice : (nat) -> S;",
    ],
    [
      "service name : S",
      "type S = service { f : () -> (nat); };\nservice ic : S;",
    ],
  ])("accepts a .did whose actor is declared as %s", async (_label, source) => {
    const root = createTempProject()
    const didFile = writeDid(root, "aliased.did", source)
    const outDir = path.join(root, "output")

    const result = await generateDeclarations({ didFile, outDir, canisterName })

    expect(result.error).toBeUndefined()
    expect(result.success).toBe(true)
    expect(
      fs.readFileSync(path.join(outDir, "declarations", "aliased.js"), "utf-8")
    ).toContain("export const idlFactory")
  })

  it("rejects a didFile whose basename is a directory reference", async () => {
    const root = createTempProject()
    const outDir = path.join(root, "output")

    // `path.join` would normalize this away; an absolute didFile reaches the
    // generator unnormalized, and `path.basename` happily returns "..".
    const result = await generateDeclarations({
      didFile: `${root}/canisters/..`,
      outDir,
      canisterName,
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain("refers to a directory")
  })

  it("rejects a didFile that is not a regular file", async () => {
    const root = createTempProject()
    const didDir = path.join(root, "backend.did")
    fs.mkdirSync(didDir)

    const result = await generateDeclarations({
      didFile: didDir,
      outDir: path.join(root, "output"),
      canisterName,
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain("not a regular file")
  })

  it("declarationsExist finds output named after the .did, not the canister", async () => {
    const root = createTempProject()
    const didFile = writeDid(root, "service.did", validDidContent)
    const outDir = path.join(root, "output")

    expect(declarationsExist(outDir, canisterName)).toBe(false)

    expect(
      (await generateDeclarations({ didFile, outDir, canisterName })).success
    ).toBe(true)

    expect(declarationsExist(outDir, canisterName)).toBe(true)
    expect(declarationsExist(outDir, canisterName, didFile)).toBe(true)
    expect(declarationsExist(outDir, canisterName, "other.did")).toBe(false)
  })

  describe("formatting", () => {
    // Linked into a fixture's node_modules, so it resolves from the fixture's
    // projectRoot the way a consumer's own install does.
    const prettierDir = path.dirname(
      createRequire(import.meta.url).resolve("prettier/package.json")
    )

    function linkPrettier(root: string) {
      fs.mkdirSync(path.join(root, "node_modules"))
      fs.symlinkSync(
        prettierDir,
        path.join(root, "node_modules", "prettier"),
        "junction"
      )
    }

    function readOutput(outDir: string) {
      const dir = path.join(outDir, "declarations")
      return {
        js: fs.readFileSync(path.join(dir, "test.js"), "utf-8"),
        dts: fs.readFileSync(path.join(dir, "test.d.ts"), "utf-8"),
      }
    }

    it("formats with the project's Prettier, under the config for each file's final path", async () => {
      const root = createTempProject()
      linkPrettier(root)
      fs.writeFileSync(
        path.join(root, ".prettierrc"),
        JSON.stringify({
          semi: false,
          // Matches where the .d.ts ends up and not the staging directory the
          // generator writes it to first, so it applies only if the generator
          // resolves the config for the final path.
          overrides: [
            { files: "output/declarations/*.d.ts", options: { semi: true } },
          ],
        })
      )
      const didFile = writeDid(root, "test.did", validDidContent)
      const outDir = path.join(root, "output")

      const result = await generateDeclarations({
        didFile,
        outDir,
        canisterName,
        projectRoot: root,
      })

      expect(result.error).toBeUndefined()
      const { js, dts } = readOutput(outDir)
      expect(js).toBe(
        [
          "export const idlFactory = ({ IDL }) => {",
          '  return IDL.Service({ greet: IDL.Func([IDL.Text], [IDL.Text], ["query"]) })',
          "}",
          "export const init = ({ IDL }) => {",
          "  return []",
          "}",
          "",
        ].join("\n")
      )
      expect(dts).toBe(
        [
          'import type { Principal } from "@icp-sdk/core/principal";',
          'import type { ActorMethod } from "@icp-sdk/core/agent";',
          'import type { IDL } from "@icp-sdk/core/candid";',
          "",
          "export interface _SERVICE {",
          "  greet: ActorMethod<[string], string>;",
          "}",
          "export declare const idlFactory: IDL.InterfaceFactory;",
          "export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];",
          "",
        ].join("\n")
      )
      // The .did copy stays byte-identical to its source.
      expect(
        fs.readFileSync(path.join(outDir, "declarations", "test.did"), "utf-8")
      ).toBe(validDidContent)
    })

    it("writes the parser output when Prettier does not resolve from projectRoot", async () => {
      const root = createTempProject()
      // A config but no Prettier to apply it, which is the common case.
      fs.writeFileSync(
        path.join(root, ".prettierrc"),
        JSON.stringify({ semi: false })
      )
      expect(() =>
        createRequire(path.join(root, "noop.js")).resolve("prettier")
      ).toThrow()
      const didFile = writeDid(root, "test.did", validDidContent)
      const outDir = path.join(root, "output")

      const result = await generateDeclarations({
        didFile,
        outDir,
        canisterName,
        projectRoot: root,
      })

      expect(result.success).toBe(true)
      expect(readOutput(outDir)).toEqual({
        js: `${didToJs(validDidContent)}\n`,
        dts: `${didToTs(validDidContent)}\n`,
      })
    })

    // Real Prettier failures rather than stand-ins. The first throws from
    // resolveConfig, the second from format.
    it.each([
      ["the config does not parse", "{ semi: false,,"],
      [
        "the config names a plugin that is not installed",
        JSON.stringify({ plugins: ["prettier-plugin-not-installed"] }),
      ],
    ])(
      "writes the parser output when Prettier throws because %s",
      async (_label, prettierrc) => {
        const root = createTempProject()
        linkPrettier(root)
        fs.writeFileSync(path.join(root, ".prettierrc"), prettierrc)
        const didFile = writeDid(root, "test.did", validDidContent)
        const outDir = path.join(root, "output")

        const result = await generateDeclarations({
          didFile,
          outDir,
          canisterName,
          projectRoot: root,
        })

        expect(result.error).toBeUndefined()
        expect(result.success).toBe(true)
        expect(readOutput(outDir)).toEqual({
          js: `${didToJs(validDidContent)}\n`,
          dts: `${didToTs(validDidContent)}\n`,
        })
      }
    )

    it("resolves a plugin the config names from projectRoot, not the working directory", async () => {
      const root = createTempProject()
      linkPrettier(root)
      // Installed in the project only. The test runs with its working directory
      // in packages/codegen, where Prettier would look for it by name.
      const pluginDir = path.join(root, "node_modules", "prettier-plugin-local")
      fs.mkdirSync(pluginDir)
      fs.writeFileSync(
        path.join(pluginDir, "package.json"),
        JSON.stringify({ name: "prettier-plugin-local", main: "index.js" })
      )
      fs.writeFileSync(
        path.join(pluginDir, "index.js"),
        "module.exports = {}\n"
      )
      expect(() =>
        createRequire(import.meta.url).resolve("prettier-plugin-local")
      ).toThrow()
      fs.writeFileSync(
        path.join(root, ".prettierrc"),
        JSON.stringify({ semi: false, plugins: ["prettier-plugin-local"] })
      )
      const didFile = writeDid(root, "test.did", validDidContent)
      const outDir = path.join(root, "output")

      await generateDeclarations({
        didFile,
        outDir,
        canisterName,
        projectRoot: root,
      })

      expect(readOutput(outDir).js).toBe(
        [
          "export const idlFactory = ({ IDL }) => {",
          '  return IDL.Service({ greet: IDL.Func([IDL.Text], [IDL.Text], ["query"]) })',
          "}",
          "export const init = ({ IDL }) => {",
          "  return []",
          "}",
          "",
        ].join("\n")
      )
    })

    it("keeps the TypeScript parser for the .d.ts when the config sets a parser", async () => {
      const root = createTempProject()
      linkPrettier(root)
      fs.writeFileSync(
        path.join(root, ".prettierrc"),
        JSON.stringify({ semi: false, parser: "babel" })
      )
      const didFile = writeDid(root, "test.did", validDidContent)
      const outDir = path.join(root, "output")

      await generateDeclarations({
        didFile,
        outDir,
        canisterName,
        projectRoot: root,
      })

      const { dts } = readOutput(outDir)
      expect(dts).not.toBe(`${didToTs(validDidContent)}\n`)
      expect(dts).toContain("export interface _SERVICE {\n")
      expect(dts).toContain("  greet: ActorMethod<[string], string>\n")
    })
  })
})
