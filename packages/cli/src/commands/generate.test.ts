import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { runCli } from "../program.js"
import { generateCommand } from "./generate.js"
import { CONFIG_FILE_NAME } from "../utils/config.js"
import { CliError } from "../utils/errors.js"
import type { CodegenConfig } from "../types.js"

const DID = `service : {
  greet: (text) -> (text) query;
}
`

describe("generate", () => {
  const tempDirs: string[] = []
  let originalCwd: string

  beforeEach(() => {
    originalCwd = process.cwd()
  })

  afterEach(() => {
    process.chdir(originalCwd)
    for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true })
    tempDirs.length = 0
    vi.restoreAllMocks()
  })

  /**
   * A project with one canister, entered as the cwd — which is how the CLI
   * decides which project it is acting on.
   */
  function createProject(config?: Partial<CodegenConfig>): string {
    const projectRoot = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "ic-reactor-cli-generate-"))
    )
    tempDirs.push(projectRoot)

    fs.writeFileSync(path.join(projectRoot, "backend.did"), DID)
    fs.writeFileSync(
      path.join(projectRoot, CONFIG_FILE_NAME),
      JSON.stringify(
        {
          outDir: "src/declarations",
          clientManagerPath: "../../clients",
          canisters: {
            backend: { name: "backend", didFile: "./backend.did" },
          },
          ...config,
        },
        null,
        2
      )
    )

    process.chdir(projectRoot)
    return projectRoot
  }

  /** Everything the CLI writes for one canister, relative to the project root. */
  function generatedFiles(projectRoot: string, canister = "backend"): string[] {
    const dir = path.join(projectRoot, "src/declarations", canister)
    if (!fs.existsSync(dir)) return []

    const found: string[] = []
    const walk = (current: string) => {
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name)
        if (entry.isDirectory()) walk(full)
        else found.push(path.relative(projectRoot, full))
      }
    }
    walk(dir)
    return found.sort()
  }

  it("generates declarations and hooks for every configured canister", async () => {
    const projectRoot = createProject()

    expect(await runCli(["generate"])).toBe(0)

    expect(generatedFiles(projectRoot)).toEqual([
      "src/declarations/backend/declarations/backend.d.ts",
      "src/declarations/backend/declarations/backend.did",
      "src/declarations/backend/declarations/backend.js",
      "src/declarations/backend/index.generated.ts",
      "src/declarations/backend/index.ts",
    ])

    const generated = fs.readFileSync(
      path.join(projectRoot, "src/declarations/backend/index.generated.ts"),
      "utf-8"
    )
    expect(generated).toContain("useBackendQuery")
  })

  it("runs from a subdirectory of the project", async () => {
    const projectRoot = createProject()
    const nested = path.join(projectRoot, "app", "src")
    fs.mkdirSync(nested, { recursive: true })
    process.chdir(nested)

    expect(await runCli(["generate"])).toBe(0)

    // Paths are resolved against the directory holding the config, not the cwd.
    expect(generatedFiles(projectRoot)).toContain(
      "src/declarations/backend/index.generated.ts"
    )
  })

  it("fails with exit code 1 on a broken .did and keeps the previous entry files", async () => {
    const projectRoot = createProject()
    expect(await runCli(["generate"])).toBe(0)

    const entryPath = path.join(
      projectRoot,
      "src/declarations/backend/index.ts"
    )
    fs.writeFileSync(
      entryPath,
      "// hand-written entry\nexport const mine = 1\n"
    )
    fs.writeFileSync(
      path.join(projectRoot, "backend.did"),
      "service : { this is not candid }"
    )

    expect(await runCli(["generate"])).toBe(1)

    // The pipeline empties `declarations/` before it parses, so that directory
    // is expected to be gone; what must survive is the user's own entry file.
    expect(fs.readFileSync(entryPath, "utf-8")).toContain("hand-written entry")
    expect(
      fs.existsSync(
        path.join(projectRoot, "src/declarations/backend/index.generated.ts")
      )
    ).toBe(true)
  })

  it("reports a malformed config by name instead of crashing", async () => {
    const projectRoot = createProject()
    fs.writeFileSync(
      path.join(projectRoot, CONFIG_FILE_NAME),
      JSON.stringify({
        outDir: "src/declarations",
        canister: { backend: { name: "backend", didFile: "./backend.did" } },
      })
    )

    // `Object.keys(config.canisters)` used to throw a raw TypeError here, so the
    // exit code came from an unhandled rejection rather than from the CLI.
    await expect(generateCommand({})).rejects.toThrow(CliError)
    await expect(generateCommand({})).rejects.toThrow(CONFIG_FILE_NAME)
    expect(await runCli(["generate"])).toBe(1)
  })

  it("fails when no config can be found", async () => {
    const emptyDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "ic-reactor-cli-noconfig-"))
    )
    tempDirs.push(emptyDir)
    process.chdir(emptyDir)

    await expect(generateCommand({})).rejects.toThrow(
      new RegExp(`No ${CONFIG_FILE_NAME} found`)
    )
  })

  it("fails when the named canister is not configured", async () => {
    createProject()

    await expect(generateCommand({ canister: "frontend" })).rejects.toThrow(
      /frontend/
    )
    expect(await runCli(["generate", "--canister", "frontend"])).toBe(1)
  })

  describe("--clean", () => {
    /** Output left behind by a canister that has since been renamed. */
    function writeStaleOutput(projectRoot: string, name = "old_name"): string {
      const dir = path.join(projectRoot, "src/declarations", name)
      fs.mkdirSync(path.join(dir, "declarations"), { recursive: true })
      fs.writeFileSync(
        path.join(dir, "index.generated.ts"),
        "// stale generated reactor\n"
      )
      fs.writeFileSync(path.join(dir, "index.ts"), "// stale entry\n")
      return dir
    }

    it("removes the output of a canister that is no longer configured", async () => {
      const projectRoot = createProject()
      const staleDir = writeStaleOutput(projectRoot)

      expect(await runCli(["generate", "--clean"])).toBe(0)

      expect(fs.existsSync(staleDir)).toBe(false)
      expect(generatedFiles(projectRoot)).toContain(
        "src/declarations/backend/index.generated.ts"
      )
    })

    it("leaves stale output alone without the flag", async () => {
      const projectRoot = createProject()
      const staleDir = writeStaleOutput(projectRoot)

      expect(await runCli(["generate"])).toBe(0)

      expect(fs.existsSync(staleDir)).toBe(true)
    })

    it("keeps the output of canisters that are still configured", async () => {
      const projectRoot = createProject()
      expect(await runCli(["generate"])).toBe(0)

      const entryPath = path.join(
        projectRoot,
        "src/declarations/backend/index.ts"
      )
      fs.writeFileSync(
        entryPath,
        "// hand-written entry\nexport const mine = 1\n"
      )

      expect(await runCli(["generate", "--clean"])).toBe(0)

      // `index.ts` belongs to the user — the pipeline preserves it on every run,
      // so cleaning must not be the one thing that deletes it.
      expect(fs.readFileSync(entryPath, "utf-8")).toContain(
        "hand-written entry"
      )
    })

    it("keeps a canister whose own outDir is not named after it", async () => {
      const projectRoot = createProject({
        canisters: {
          backend: {
            name: "backend",
            didFile: "./backend.did",
            outDir: "src/declarations/be",
          },
        },
      })
      expect(await runCli(["generate"])).toBe(0)

      expect(await runCli(["generate", "--clean"])).toBe(0)

      expect(
        fs.existsSync(path.join(projectRoot, "src/declarations/be/index.ts"))
      ).toBe(true)
    })

    it("never deletes a directory this CLI did not generate", async () => {
      const projectRoot = createProject()
      const handWritten = path.join(projectRoot, "src/declarations/shared")
      fs.mkdirSync(handWritten, { recursive: true })
      fs.writeFileSync(
        path.join(handWritten, "types.ts"),
        "export type X = 1\n"
      )

      expect(await runCli(["generate", "--clean"])).toBe(0)

      // `outDir` routinely points at a directory that also holds hand-written
      // code, so "clean" is restricted to directories carrying a generation
      // marker.
      expect(fs.existsSync(path.join(handWritten, "types.ts"))).toBe(true)
    })

    it("refuses an outDir that escapes the project root", async () => {
      const projectRoot = createProject({ outDir: "../escaped" })
      const escaped = path.join(path.dirname(projectRoot), "escaped")
      fs.mkdirSync(path.join(escaped, "old_name"), { recursive: true })
      fs.writeFileSync(
        path.join(escaped, "old_name", "index.generated.ts"),
        "// not ours to delete\n"
      )
      tempDirs.push(escaped)

      expect(await runCli(["generate", "--clean"])).toBe(1)
      expect(
        fs.existsSync(path.join(escaped, "old_name", "index.generated.ts"))
      ).toBe(true)
    })
  })
})
