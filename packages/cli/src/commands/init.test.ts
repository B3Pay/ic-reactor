import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import * as p from "@clack/prompts"
import ts from "typescript"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { runCli } from "../program.js"
import { CONFIG_FILE_NAME } from "../utils/config.js"

// Prompts are mocked to *refuse*, not to answer. That is the assertion: a
// non-interactive run must never reach one. With stdin closed — CI — a real
// prompt resolves as a cancel, which is how `init -y` used to exit 0 having
// written nothing at all.
vi.mock("@clack/prompts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@clack/prompts")>()
  const refuse = (kind: string) =>
    vi.fn(async (): Promise<unknown> => {
      throw new Error(`unexpected ${kind} prompt in a non-interactive test`)
    })

  // `CANCEL_SYMBOL` and `isCancel` come through `actual` untouched, so a test
  // signals Ctrl+C by resolving a prompt with the real cancel value.
  return {
    ...actual,
    confirm: refuse("confirm"),
    text: refuse("text"),
    select: refuse("select"),
  }
})

/**
 * The file tsc resolves a generated reactor's `clientManager` import to, or
 * `undefined` where tsc reports TS2307 "Cannot find module".
 */
function resolveClientManagerImport(reactorFile: string): string | undefined {
  const source = fs.readFileSync(reactorFile, "utf-8")
  const specifier = /^import \{ clientManager \} from "([^"]+)"$/m.exec(
    source
  )?.[1]
  if (specifier === undefined) {
    throw new Error(`${reactorFile} has no clientManager import`)
  }

  return ts.resolveModuleName(
    specifier,
    reactorFile,
    {
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
    },
    ts.sys
  ).resolvedModule?.resolvedFileName
}

describe("init", () => {
  const tempDirs: string[] = []
  let originalCwd: string

  beforeEach(() => {
    originalCwd = process.cwd()
  })

  afterEach(() => {
    process.chdir(originalCwd)
    for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true })
    tempDirs.length = 0
    vi.clearAllMocks()
  })

  /** A temp directory, resolved through symlinks so it matches `process.cwd()`. */
  function createTempDir(): string {
    const dir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "ic-reactor-cli-init-"))
    )
    tempDirs.push(dir)
    return dir
  }

  /** Configure a canister, as a user does between `init` and `generate`. */
  function addCanister(projectRoot: string): void {
    fs.writeFileSync(
      path.join(projectRoot, "backend.did"),
      "service : { greet : (text) -> (text) query }\n"
    )
    const configPath = path.join(projectRoot, CONFIG_FILE_NAME)
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"))
    config.canisters.backend = { name: "backend", didFile: "./backend.did" }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
  }

  const existingConfig = `${JSON.stringify(
    {
      outDir: "src/declarations",
      canisters: {
        backend: { name: "backend", didFile: "./backend.did" },
      },
    },
    null,
    2
  )}\n`

  it("scaffolds a fresh project without asking anything", async () => {
    const projectRoot = createTempDir()
    process.chdir(projectRoot)

    const exitCode = await runCli(["init", "-y"])

    expect(exitCode).toBe(0)
    expect(p.confirm).not.toHaveBeenCalled()
    expect(p.text).not.toHaveBeenCalled()

    const config = JSON.parse(
      fs.readFileSync(path.join(projectRoot, CONFIG_FILE_NAME), "utf-8")
    )
    expect(config).toMatchObject({ outDir: "src/declarations", canisters: {} })
    expect(fs.existsSync(path.join(projectRoot, "src/declarations"))).toBe(true)
    expect(fs.existsSync(path.join(projectRoot, "src/clients.ts"))).toBe(true)
  })

  it("honours --out-dir without prompting", async () => {
    const projectRoot = createTempDir()
    process.chdir(projectRoot)

    expect(await runCli(["init", "-y", "--out-dir", "generated"])).toBe(0)

    const config = JSON.parse(
      fs.readFileSync(path.join(projectRoot, CONFIG_FILE_NAME), "utf-8")
    )
    expect(config.outDir).toBe("generated")
    expect(fs.existsSync(path.join(projectRoot, "generated"))).toBe(true)
  })

  // `generate` imports the client manager through `clientManagerPath` from
  // `<outDir>/<canister>/`, and that setting defaults to "../../clients".
  // `init -y` wrote the helper to src/clients.ts and left the setting unset, so
  // the import reached the helper only when outDir sat directly inside src/.
  // With any other --out-dir the first `generate` emitted an import tsc could
  // not resolve (TS2307).
  it.each(["src/declarations", "lib/canisters", "generated", "."])(
    "writes a client manager that generate imports, with --out-dir %s",
    async (outDir) => {
      const projectRoot = createTempDir()
      process.chdir(projectRoot)

      expect(await runCli(["init", "-y", "--out-dir", outDir])).toBe(0)
      addCanister(projectRoot)
      expect(await runCli(["generate"])).toBe(0)

      const reactorFile = path.join(
        projectRoot,
        outDir,
        "backend",
        "index.generated.ts"
      )
      expect(resolveClientManagerImport(reactorFile)).toBe(
        path.join(projectRoot, "src/clients.ts")
      )
    }
  )

  // The import is worked out between real paths. Between the paths as written,
  // an absolute --out-dir that reaches the project through a symlink (such as
  // "$PWD/…" in a symlinked checkout) gives an import that climbs out of the
  // real directory tree, which is where tsc resolves it from.
  it("writes a client manager that generate imports, with an absolute --out-dir through a symlink", async () => {
    const projectRoot = createTempDir()
    const link = path.join(createTempDir(), "nested", "project")
    fs.mkdirSync(path.dirname(link))
    fs.symlinkSync(projectRoot, link, "junction")
    process.chdir(projectRoot)

    const outDir = path.join(link, "lib", "canisters")
    expect(await runCli(["init", "-y", "--out-dir", outDir])).toBe(0)
    addCanister(projectRoot)
    expect(await runCli(["generate"])).toBe(0)

    const reactorFile = path.join(
      projectRoot,
      "lib/canisters/backend/index.generated.ts"
    )
    expect(resolveClientManagerImport(reactorFile)).toBe(
      path.join(projectRoot, "src/clients.ts")
    )
  })

  it("writes into the current directory, never into an ancestor project", async () => {
    // `getProjectRoot()` walked up to the nearest ic-reactor.json, so this run
    // targeted the ancestor: it replaced that project's config with defaults —
    // wiping its `canisters` map — and created nothing in the cwd.
    const projectRoot = createTempDir()
    const ancestorConfigPath = path.join(projectRoot, CONFIG_FILE_NAME)
    fs.writeFileSync(ancestorConfigPath, existingConfig)

    const nested = path.join(projectRoot, "packages", "app")
    fs.mkdirSync(nested, { recursive: true })
    process.chdir(nested)

    const exitCode = await runCli(["init", "-y"])

    expect(exitCode).toBe(0)
    expect(fs.readFileSync(ancestorConfigPath, "utf-8")).toBe(existingConfig)
    expect(fs.existsSync(path.join(nested, CONFIG_FILE_NAME))).toBe(true)
    expect(fs.existsSync(path.join(nested, "src/clients.ts"))).toBe(true)
  })

  it("leaves an existing config in place under -y", async () => {
    const projectRoot = createTempDir()
    const configPath = path.join(projectRoot, CONFIG_FILE_NAME)
    fs.writeFileSync(configPath, existingConfig)
    process.chdir(projectRoot)

    const exitCode = await runCli(["init", "-y"])

    expect(exitCode).toBe(0)
    expect(p.confirm).not.toHaveBeenCalled()
    expect(fs.readFileSync(configPath, "utf-8")).toBe(existingConfig)
  })

  it("asks before overwriting a config in the current directory", async () => {
    const projectRoot = createTempDir()
    const configPath = path.join(projectRoot, CONFIG_FILE_NAME)
    fs.writeFileSync(configPath, existingConfig)
    process.chdir(projectRoot)

    vi.mocked(p.confirm).mockResolvedValueOnce(false)

    expect(await runCli(["init"])).toBe(0)
    expect(p.confirm).toHaveBeenCalledTimes(1)
    expect(vi.mocked(p.confirm).mock.calls[0][0].message).toContain(configPath)
    expect(fs.readFileSync(configPath, "utf-8")).toBe(existingConfig)
  })

  it("writes nothing when a canister prompt is cancelled", async () => {
    const projectRoot = createTempDir()
    process.chdir(projectRoot)

    vi.mocked(p.text)
      .mockResolvedValueOnce("src/declarations") // outDir
      .mockResolvedValueOnce("../../clients") // clientManagerPath
      .mockResolvedValueOnce("backend") // canister name
      .mockResolvedValueOnce(p.CANCEL_SYMBOL) // Ctrl+C on the .did path
    vi.mocked(p.confirm).mockResolvedValueOnce(true) // configure a canister now?

    expect(await runCli(["init"])).toBe(0)

    // Ctrl+C part-way through the canister questions used to fall through to
    // `saveConfig`, leaving a half-answered config and a client manager behind.
    expect(fs.readdirSync(projectRoot)).toEqual([])
  })

  it("completes the interactive flow when every prompt is answered", async () => {
    const projectRoot = createTempDir()
    fs.writeFileSync(path.join(projectRoot, "backend.did"), "service : {}")
    process.chdir(projectRoot)

    vi.mocked(p.text)
      .mockResolvedValueOnce("generated")
      .mockResolvedValueOnce("../../clients")
      .mockResolvedValueOnce("backend")
      .mockResolvedValueOnce("./backend.did")
    vi.mocked(p.confirm)
      .mockResolvedValueOnce(true) // configure a canister now?
      .mockResolvedValueOnce(true) // create the client manager?

    expect(await runCli(["init"])).toBe(0)

    const config = JSON.parse(
      fs.readFileSync(path.join(projectRoot, CONFIG_FILE_NAME), "utf-8")
    )
    expect(config).toMatchObject({
      outDir: "generated",
      clientManagerPath: "../../clients",
      canisters: { backend: { name: "backend", didFile: "./backend.did" } },
    })
  })

  // The prompt accepts an absolute outDir, and the pipeline resolves one as
  // it stands. init joined it onto the project root instead, so the client
  // manager landed under a copy of the absolute path inside the project, where
  // the generated `../../clients` import never looks.
  it("creates the client manager next to an absolute outDir", async () => {
    const projectRoot = createTempDir()
    fs.writeFileSync(path.join(projectRoot, "backend.did"), "service : {}")
    process.chdir(projectRoot)

    vi.mocked(p.text)
      .mockResolvedValueOnce(path.join(projectRoot, "src/declarations"))
      .mockResolvedValueOnce("../../clients")
      .mockResolvedValueOnce("backend")
      .mockResolvedValueOnce("./backend.did")
    vi.mocked(p.confirm)
      .mockResolvedValueOnce(true) // configure a canister now?
      .mockResolvedValueOnce(true) // create the client manager?

    expect(await runCli(["init"])).toBe(0)

    expect(fs.readdirSync(projectRoot).sort()).toEqual([
      "backend.did",
      CONFIG_FILE_NAME,
      "src",
    ])
    expect(fs.existsSync(path.join(projectRoot, "src/clients.ts"))).toBe(true)
  })

  it("does not carry a canister from one run into the next", async () => {
    // `DEFAULT_CONFIG` was a shared object, so `{ ...DEFAULT_CONFIG }` handed
    // every run the same `canisters` map and one run's canister showed up in
    // the next run's defaults.
    const first = createTempDir()
    fs.writeFileSync(path.join(first, "backend.did"), "service : {}")
    process.chdir(first)

    vi.mocked(p.text)
      .mockResolvedValueOnce("src/declarations")
      .mockResolvedValueOnce("../../clients")
      .mockResolvedValueOnce("backend")
      .mockResolvedValueOnce("./backend.did")
    vi.mocked(p.confirm).mockResolvedValueOnce(true).mockResolvedValueOnce(true)
    expect(await runCli(["init"])).toBe(0)

    const second = createTempDir()
    process.chdir(second)
    expect(await runCli(["init", "-y"])).toBe(0)

    const config = JSON.parse(
      fs.readFileSync(path.join(second, CONFIG_FILE_NAME), "utf-8")
    )
    expect(config.canisters).toEqual({})
  })
})
