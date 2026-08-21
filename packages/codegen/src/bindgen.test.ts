import { describe, it, expect, afterEach } from "vitest"
import fs from "node:fs"
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
})
